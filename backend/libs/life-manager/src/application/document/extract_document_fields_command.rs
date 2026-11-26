use std::sync::Arc;
use std::time::{Duration, Instant};

use backend_utils::{AppError, app_result::AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::application::document::get_extraction_limits_query::load_configured_limits;
use crate::domain::document::document_extractor::{
    DocumentExtractionError, DocumentExtractor, ExtractedDocumentFields, ExtractionSource,
    RawDocumentFields,
};
use crate::domain::document::extraction_limits::{ExtractionLimits, ExtractionLimitsReader};
use crate::domain::document::extraction_media_type::ExtractionMediaType;
use crate::domain::document::extraction_usage::{ExtractionUsage, ReserveOutcome};
use crate::domain::document::normalize_tag_names;
use crate::domain::document::pdf_reader::{PdfReader, PdfUnreadable};

const MAX_TITLE_WORDS: usize = 10;
const MAX_CONTENT_CHARS: usize = 200;
const BYTES_PER_MEGABYTE: u64 = 1024 * 1024;
const DATE_FORMAT: &str = "%Y-%m-%d";

pub struct ExtractDocumentFieldsInput {
    pub user_id: Uuid,
    pub file_bytes: Vec<u8>,
    /// UTC date of the request. The daily unit count uses this date.
    pub today: NaiveDate,
}

pub struct ExtractDocumentFieldsCommand {
    input: ExtractDocumentFieldsInput,
    limits_reader: Arc<dyn ExtractionLimitsReader>,
    usage: Arc<dyn ExtractionUsage>,
    extractor: Option<Arc<dyn DocumentExtractor>>,
    pdf_reader: Arc<dyn PdfReader>,
}

/// Facts about one request for the single log line. It never holds the
/// file bytes or the extracted text.
struct ExtractionTrace {
    user_id: Uuid,
    size_bytes: usize,
    media_type: Option<ExtractionMediaType>,
    path: Option<&'static str>,
    page_count: Option<u32>,
}

/// The source to send to the extractor, with the facts to log about it.
struct PreparedSource {
    source: ExtractionSource,
    path: &'static str,
    page_count: Option<u32>,
}

impl ExtractDocumentFieldsCommand {
    pub fn new(
        input: ExtractDocumentFieldsInput,
        limits_reader: Arc<dyn ExtractionLimitsReader>,
        usage: Arc<dyn ExtractionUsage>,
        extractor: Option<Arc<dyn DocumentExtractor>>,
        pdf_reader: Arc<dyn PdfReader>,
    ) -> Self {
        Self {
            input,
            limits_reader,
            usage,
            extractor,
            pdf_reader,
        }
    }

    /// Reads Document form fields from an image or a PDF. Stores nothing.
    /// A daily unit is taken only after all local checks pass. A provider
    /// failure keeps the unit.
    ///
    /// ```text
    /// Handler -> Command : execute(user_id, file_bytes, today)
    ///   alt extractor not configured
    ///     Command --> Handler : 503
    ///   alt empty file
    ///     Command --> Handler : 400
    /// Command -> ExtractionLimitsReader : load
    ///   alt row missing
    ///     Command --> Handler : 503
    ///   alt size > max_file_bytes
    ///     Command --> Handler : 413
    /// Command -> ExtractionMediaType : detect(magic number)
    ///   alt unknown type
    ///     Command --> Handler : 400
    ///   alt PDF
    ///     Command -> PdfReader : embedded_text
    ///       alt has text  : source = Text
    ///       alt no text   : PdfReader -> first_pages(max_pdf_pages) : source = File(PDF)
    ///       alt unreadable: Command --> Handler : 400 "Cannot read this PDF"
    ///   else image : source = File(image)
    /// Command -> ExtractionUsage : reserve(user_id, today, daily_limit_per_user)
    ///   alt limit reached
    ///     Command --> Handler : 429 (extractor not called)
    /// Command -> DocumentExtractor : extract(source)
    ///   alt QuotaExceeded       : 429
    ///   alt Timeout             : 504
    ///   alt Provider / Invalid  : 502
    /// Command -> Command : normalize fields
    /// Command -> log : user_id, media_type, size, pages, path, latency, status
    /// Command --> Handler : ExtractedDocumentFields
    /// ```
    pub async fn execute(self) -> AppResult<ExtractedDocumentFields> {
        let started = Instant::now();
        let mut trace = ExtractionTrace {
            user_id: self.input.user_id,
            size_bytes: self.input.file_bytes.len(),
            media_type: None,
            path: None,
            page_count: None,
        };
        let result = self.run(&mut trace).await;
        trace.log(started.elapsed(), &result);
        result
    }

    async fn run(self, trace: &mut ExtractionTrace) -> AppResult<ExtractedDocumentFields> {
        let Some(extractor) = self.extractor else {
            return Err(AppError::ServiceUnavailable(
                "Extraction is not available.".to_string(),
            ));
        };
        let ExtractDocumentFieldsInput {
            user_id,
            file_bytes,
            today,
        } = self.input;
        if file_bytes.is_empty() {
            return Err(AppError::Validation("The file is empty.".to_string()));
        }
        let limits = load_configured_limits(self.limits_reader.as_ref()).await?;
        check_file_size(file_bytes.len(), &limits)?;
        let media_type = detect_media_type(&file_bytes)?;
        trace.media_type = Some(media_type);

        let prepared =
            prepare_source(self.pdf_reader.as_ref(), file_bytes, media_type, &limits).await?;
        trace.path = Some(prepared.path);
        trace.page_count = prepared.page_count;

        reserve_unit(self.usage.as_ref(), user_id, today, &limits).await?;
        let raw_fields = extractor
            .extract(prepared.source)
            .await
            .map_err(map_extraction_error)?;
        Ok(normalize_fields(raw_fields))
    }
}

fn check_file_size(size_bytes: usize, limits: &ExtractionLimits) -> AppResult<()> {
    if size_bytes as u64 <= limits.max_file_bytes {
        return Ok(());
    }
    Err(AppError::PayloadTooLarge(format!(
        "The file is larger than {} MB.",
        format_megabytes(limits.max_file_bytes)
    )))
}

fn format_megabytes(bytes: u64) -> String {
    if bytes.is_multiple_of(BYTES_PER_MEGABYTE) {
        return (bytes / BYTES_PER_MEGABYTE).to_string();
    }
    format!("{:.1}", bytes as f64 / BYTES_PER_MEGABYTE as f64)
}

fn detect_media_type(bytes: &[u8]) -> AppResult<ExtractionMediaType> {
    ExtractionMediaType::detect(bytes).ok_or_else(|| {
        AppError::Validation(
            "Unsupported file type. Use PNG, JPEG, WebP, HEIC, or PDF.".to_string(),
        )
    })
}

async fn prepare_source(
    pdf_reader: &dyn PdfReader,
    bytes: Vec<u8>,
    media_type: ExtractionMediaType,
    limits: &ExtractionLimits,
) -> AppResult<PreparedSource> {
    if media_type != ExtractionMediaType::Pdf {
        return Ok(PreparedSource {
            source: ExtractionSource::File { bytes, media_type },
            path: "file",
            page_count: None,
        });
    }
    prepare_pdf_source(pdf_reader, bytes, limits.max_pdf_pages)
        .await
        .map_err(|PdfUnreadable| AppError::Validation("Cannot read this PDF".to_string()))
}

/// Sends the embedded text when the PDF has it. A scanned PDF goes as a file,
/// cut to its first `max_pages` pages.
async fn prepare_pdf_source(
    pdf_reader: &dyn PdfReader,
    bytes: Vec<u8>,
    max_pages: u32,
) -> Result<PreparedSource, PdfUnreadable> {
    if let Some(text) = pdf_reader.embedded_text(bytes.clone()).await? {
        return Ok(PreparedSource {
            source: ExtractionSource::Text(text),
            path: "text",
            page_count: None,
        });
    }
    let (cut_pdf, page_count) = pdf_reader.first_pages(bytes, max_pages).await?;
    Ok(PreparedSource {
        source: ExtractionSource::File {
            bytes: cut_pdf,
            media_type: ExtractionMediaType::Pdf,
        },
        path: "file",
        page_count: Some(page_count),
    })
}

async fn reserve_unit(
    usage: &dyn ExtractionUsage,
    user_id: Uuid,
    today: NaiveDate,
    limits: &ExtractionLimits,
) -> AppResult<()> {
    match usage
        .reserve(user_id, today, limits.daily_limit_per_user)
        .await
    {
        Ok(ReserveOutcome::Reserved { .. }) => Ok(()),
        Ok(ReserveOutcome::LimitReached) => Err(AppError::TooManyRequests(
            "You have no extractions left today.".to_string(),
        )),
        Err(err) => {
            tracing::error!("Failed to reserve a document extraction unit: {err:?}");
            Err(AppError::Internal(err))
        }
    }
}

/// The variant detail goes to the log. It holds a status or a parse error,
/// never the document text.
fn map_extraction_error(error: DocumentExtractionError) -> AppError {
    tracing::warn!("Document extraction failed: {error:?}");
    match error {
        DocumentExtractionError::QuotaExceeded => AppError::TooManyRequests(
            "The shared extraction quota is used up. Try again later.".to_string(),
        ),
        DocumentExtractionError::Timeout => {
            AppError::GatewayTimeout("Extraction timed out. Try again.".to_string())
        }
        DocumentExtractionError::Provider(_) => {
            AppError::BadGateway("Extraction failed. Try again later.".to_string())
        }
        DocumentExtractionError::InvalidResponse(_) => {
            AppError::BadGateway("Extraction returned an invalid response.".to_string())
        }
    }
}

fn normalize_fields(raw: RawDocumentFields) -> ExtractedDocumentFields {
    ExtractedDocumentFields {
        title: normalize_title(raw.title),
        content: normalize_content(raw.content),
        tags: normalize_tag_names(&raw.tags),
        issued_date: parse_date(raw.issued_date),
        expire_date: parse_date(raw.expire_date),
    }
}

/// Trims the value. An empty result becomes `None`.
fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed)
}

fn normalize_title(title: Option<String>) -> Option<String> {
    let title = normalize_optional_text(title)?;
    Some(
        title
            .split_whitespace()
            .take(MAX_TITLE_WORDS)
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn normalize_content(content: Option<String>) -> Option<String> {
    let content = normalize_optional_text(content)?;
    Some(content.chars().take(MAX_CONTENT_CHARS).collect())
}

/// A value that is not a real `YYYY-MM-DD` date (for example 2027-02-30) becomes `None`.
fn parse_date(value: Option<String>) -> Option<NaiveDate> {
    let value = normalize_optional_text(value)?;
    NaiveDate::parse_from_str(&value, DATE_FORMAT).ok()
}

impl ExtractionTrace {
    fn log(&self, latency: Duration, result: &AppResult<ExtractedDocumentFields>) {
        tracing::info!(
            user_id = %self.user_id,
            media_type = self.media_type.map(|media_type| media_type.mime_type()),
            size_bytes = self.size_bytes,
            page_count = self.page_count,
            path = self.path,
            latency_ms = latency.as_millis() as u64,
            status = outcome_label(result),
            "Document extraction finished"
        );
    }
}

fn outcome_label(result: &AppResult<ExtractedDocumentFields>) -> &'static str {
    match result {
        Ok(_) => "ok",
        Err(AppError::Validation(_)) => "invalid_input",
        Err(AppError::PayloadTooLarge(_)) => "payload_too_large",
        Err(AppError::TooManyRequests(_)) => "too_many_requests",
        Err(AppError::ServiceUnavailable(_)) => "service_unavailable",
        Err(AppError::BadGateway(_)) => "bad_gateway",
        Err(AppError::GatewayTimeout(_)) => "gateway_timeout",
        Err(_) => "internal_error",
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::document::document_extractor::tests::FakeDocumentExtractor;
    use crate::domain::document::extraction_limits::tests::{FixedExtractionLimits, SEEDED_LIMITS};
    use crate::domain::document::extraction_usage::tests::InMemoryExtractionUsage;
    use crate::domain::document::pdf_reader::tests::FakePdfReader;

    use super::*;

    const JPEG_BYTES: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    const PDF_BYTES: &[u8] = b"%PDF-1.7\n";

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 26).expect("valid date")
    }

    fn raw_fields() -> RawDocumentFields {
        RawDocumentFields {
            title: Some("Car insurance policy".to_string()),
            content: Some("Policy for the family car.".to_string()),
            tags: vec!["Insurance".to_string(), "car".to_string()],
            issued_date: Some("2026-01-15".to_string()),
            expire_date: Some("2027-01-14".to_string()),
        }
    }

    /// The fakes for one command run, kept so the test can inspect them.
    struct GivenFakes {
        user_id: Uuid,
        limits: Option<ExtractionLimits>,
        usage: Arc<InMemoryExtractionUsage>,
        extractor: Arc<FakeDocumentExtractor>,
        pdf_reader: Arc<FakePdfReader>,
        extractor_configured: bool,
    }

    impl GivenFakes {
        fn new() -> Self {
            Self {
                user_id: Uuid::new_v4(),
                limits: Some(SEEDED_LIMITS),
                usage: Arc::new(InMemoryExtractionUsage::new()),
                extractor: Arc::new(FakeDocumentExtractor::returning(Ok(raw_fields()))),
                pdf_reader: Arc::new(FakePdfReader::unreadable()),
                extractor_configured: true,
            }
        }

        fn with_extractor_result(
            mut self,
            result: Result<RawDocumentFields, DocumentExtractionError>,
        ) -> Self {
            self.extractor = Arc::new(FakeDocumentExtractor::returning(result));
            self
        }

        fn with_pdf_reader(mut self, pdf_reader: FakePdfReader) -> Self {
            self.pdf_reader = Arc::new(pdf_reader);
            self
        }

        fn with_limits(mut self, limits: Option<ExtractionLimits>) -> Self {
            self.limits = limits;
            self
        }

        fn without_extractor(mut self) -> Self {
            self.extractor_configured = false;
            self
        }

        async fn execute(&self, file_bytes: &[u8]) -> AppResult<ExtractedDocumentFields> {
            let extractor = self
                .extractor_configured
                .then(|| self.extractor.clone() as Arc<dyn DocumentExtractor>);
            ExtractDocumentFieldsCommand::new(
                ExtractDocumentFieldsInput {
                    user_id: self.user_id,
                    file_bytes: file_bytes.to_vec(),
                    today: today(),
                },
                Arc::new(FixedExtractionLimits(self.limits)),
                self.usage.clone(),
                extractor,
                self.pdf_reader.clone(),
            )
            .execute()
            .await
        }

        async fn used_today(&self) -> u32 {
            self.usage
                .used_today(self.user_id, today())
                .await
                .expect("used today")
        }
    }

    #[tokio::test]
    async fn given_image_when_execute_then_sends_file_and_returns_fields() {
        let given = GivenFakes::new();

        let fields = given.execute(JPEG_BYTES).await.expect("fields");

        assert_eq!(
            given.extractor.received(),
            vec![ExtractionSource::File {
                bytes: JPEG_BYTES.to_vec(),
                media_type: ExtractionMediaType::Jpeg,
            }]
        );
        assert_eq!(
            fields,
            ExtractedDocumentFields {
                title: Some("Car insurance policy".to_string()),
                content: Some("Policy for the family car.".to_string()),
                tags: vec!["insurance".to_string(), "car".to_string()],
                issued_date: NaiveDate::from_ymd_opt(2026, 1, 15),
                expire_date: NaiveDate::from_ymd_opt(2027, 1, 14),
            }
        );
        assert_eq!(given.used_today().await, 1);
    }

    #[tokio::test]
    async fn given_pdf_with_text_when_execute_then_sends_text_only() {
        let given = GivenFakes::new().with_pdf_reader(FakePdfReader::with_text("Policy text"));

        given.execute(PDF_BYTES).await.expect("fields");

        assert_eq!(
            given.extractor.received(),
            vec![ExtractionSource::Text("Policy text".to_string())]
        );
        assert!(given.pdf_reader.first_pages_calls().is_empty());
    }

    #[tokio::test]
    async fn given_scanned_pdf_when_execute_then_sends_first_pages_as_pdf_file() {
        let given =
            GivenFakes::new().with_pdf_reader(FakePdfReader::scanned(b"%PDF-cut".to_vec(), 5));

        given.execute(PDF_BYTES).await.expect("fields");

        assert_eq!(given.pdf_reader.first_pages_calls(), vec![5]);
        assert_eq!(
            given.extractor.received(),
            vec![ExtractionSource::File {
                bytes: b"%PDF-cut".to_vec(),
                media_type: ExtractionMediaType::Pdf,
            }]
        );
    }

    #[tokio::test]
    async fn given_no_extractor_when_execute_then_service_unavailable() {
        let given = GivenFakes::new().without_extractor();

        let result = given.execute(JPEG_BYTES).await;

        assert!(matches!(result, Err(AppError::ServiceUnavailable(_))));
        assert_eq!(given.used_today().await, 0);
    }

    #[tokio::test]
    async fn given_missing_limits_when_execute_then_service_unavailable() {
        let given = GivenFakes::new().with_limits(None);

        let result = given.execute(JPEG_BYTES).await;

        assert!(matches!(result, Err(AppError::ServiceUnavailable(_))));
        assert!(given.extractor.received().is_empty());
    }

    #[tokio::test]
    async fn given_empty_file_when_execute_then_validation_and_usage_unchanged() {
        let given = GivenFakes::new();

        let result = given.execute(&[]).await;

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(given.used_today().await, 0);
    }

    #[tokio::test]
    async fn given_file_over_max_size_when_execute_then_payload_too_large_and_usage_unchanged() {
        let given = GivenFakes::new().with_limits(Some(ExtractionLimits {
            max_file_bytes: 1_048_576,
            ..SEEDED_LIMITS
        }));
        let mut two_megabyte_jpeg = JPEG_BYTES.to_vec();
        two_megabyte_jpeg.resize(2 * 1_048_576, 0);

        let result = given.execute(&two_megabyte_jpeg).await;

        match result {
            Err(AppError::PayloadTooLarge(message)) => {
                assert_eq!(message, "The file is larger than 1 MB.");
            }
            other => panic!("expected PayloadTooLarge, got {other:?}"),
        }
        assert_eq!(given.used_today().await, 0);
        assert!(given.extractor.received().is_empty());
    }

    #[test]
    fn given_whole_megabytes_when_format_then_no_decimals() {
        assert_eq!(format_megabytes(1_048_576), "1");
        assert_eq!(format_megabytes(10_485_760), "10");
        assert_eq!(format_megabytes(1_572_864), "1.5");
    }

    #[tokio::test]
    async fn given_text_file_when_execute_then_unsupported_type_and_usage_unchanged() {
        let given = GivenFakes::new();

        let result = given.execute(b"plain text notes\n").await;

        match result {
            Err(AppError::Validation(message)) => {
                assert_eq!(
                    message,
                    "Unsupported file type. Use PNG, JPEG, WebP, HEIC, or PDF."
                );
            }
            other => panic!("expected Validation, got {other:?}"),
        }
        assert_eq!(given.used_today().await, 0);
    }

    #[tokio::test]
    async fn given_unreadable_pdf_when_execute_then_cannot_read_and_usage_unchanged() {
        let given = GivenFakes::new().with_pdf_reader(FakePdfReader::unreadable());

        let result = given.execute(PDF_BYTES).await;

        match result {
            Err(AppError::Validation(message)) => assert_eq!(message, "Cannot read this PDF"),
            other => panic!("expected Validation, got {other:?}"),
        }
        assert_eq!(given.used_today().await, 0);
        assert!(given.extractor.received().is_empty());
    }

    #[tokio::test]
    async fn given_daily_limit_reached_when_execute_then_too_many_requests_and_no_extract() {
        let given = GivenFakes::new().with_limits(Some(ExtractionLimits {
            daily_limit_per_user: 0,
            ..SEEDED_LIMITS
        }));

        let result = given.execute(JPEG_BYTES).await;

        match result {
            Err(AppError::TooManyRequests(message)) => {
                assert_eq!(message, "You have no extractions left today.");
            }
            other => panic!("expected TooManyRequests, got {other:?}"),
        }
        assert!(given.extractor.received().is_empty());
    }

    async fn assert_extractor_error_maps_and_counts(
        error: DocumentExtractionError,
        expected: fn(&AppError) -> bool,
    ) {
        let given = GivenFakes::new().with_extractor_result(Err(error.clone()));

        let result = given.execute(JPEG_BYTES).await;

        let app_error = result.expect_err("extraction error");
        assert!(expected(&app_error), "{error:?} mapped to {app_error:?}");
        assert_eq!(given.used_today().await, 1, "{error:?} must count one unit");
    }

    #[tokio::test]
    async fn given_quota_exceeded_when_execute_then_shared_quota_message_and_unit_counted() {
        assert_extractor_error_maps_and_counts(DocumentExtractionError::QuotaExceeded, |error| {
            matches!(error, AppError::TooManyRequests(message)
                if message == "The shared extraction quota is used up. Try again later.")
        })
        .await;
    }

    #[tokio::test]
    async fn given_timeout_when_execute_then_gateway_timeout_and_unit_counted() {
        assert_extractor_error_maps_and_counts(DocumentExtractionError::Timeout, |error| {
            matches!(error, AppError::GatewayTimeout(_))
        })
        .await;
    }

    #[tokio::test]
    async fn given_provider_error_when_execute_then_bad_gateway_and_unit_counted() {
        assert_extractor_error_maps_and_counts(
            DocumentExtractionError::Provider("status 500".to_string()),
            |error| {
                matches!(error, AppError::BadGateway(message)
                    if message == "Extraction failed. Try again later.")
            },
        )
        .await;
    }

    #[tokio::test]
    async fn given_invalid_response_when_execute_then_bad_gateway_and_unit_counted() {
        assert_extractor_error_maps_and_counts(
            DocumentExtractionError::InvalidResponse("not json".to_string()),
            |error| {
                matches!(error, AppError::BadGateway(message)
                    if message == "Extraction returned an invalid response.")
            },
        )
        .await;
    }

    #[tokio::test]
    async fn given_blank_result_when_execute_then_all_fields_empty() {
        let given = GivenFakes::new().with_extractor_result(Ok(RawDocumentFields::default()));

        let fields = given.execute(JPEG_BYTES).await.expect("fields");

        assert_eq!(
            fields,
            ExtractedDocumentFields {
                title: None,
                content: None,
                tags: Vec::new(),
                issued_date: None,
                expire_date: None,
            }
        );
    }

    #[test]
    fn given_eleven_word_title_when_normalize_then_first_ten_words() {
        let title = Some("  one two  three four five six seven eight nine ten eleven ".to_string());

        assert_eq!(
            normalize_title(title),
            Some("one two three four five six seven eight nine ten".to_string())
        );
    }

    #[test]
    fn given_250_char_content_when_normalize_then_200_chars() {
        let content = normalize_content(Some("é".repeat(250))).expect("content");

        assert_eq!(content.chars().count(), 200);
    }

    #[test]
    fn given_whitespace_only_values_when_normalize_then_none() {
        let fields = normalize_fields(RawDocumentFields {
            title: Some("   ".to_string()),
            content: Some("\n\t".to_string()),
            tags: vec!["  ".to_string()],
            issued_date: Some(" ".to_string()),
            expire_date: Some(String::new()),
        });

        assert_eq!(fields.title, None);
        assert_eq!(fields.content, None);
        assert!(fields.tags.is_empty());
        assert_eq!(fields.issued_date, None);
        assert_eq!(fields.expire_date, None);
    }

    #[test]
    fn given_invalid_dates_when_normalize_then_none() {
        assert_eq!(parse_date(Some("2027-02-30".to_string())), None);
        assert_eq!(parse_date(Some("15/01/2026".to_string())), None);
        assert_eq!(
            parse_date(Some(" 2028-02-29 ".to_string())),
            NaiveDate::from_ymd_opt(2028, 2, 29)
        );
    }

    #[test]
    fn given_duplicate_and_upper_case_tags_when_normalize_then_deduped_lower_case() {
        let fields = normalize_fields(RawDocumentFields {
            tags: vec![
                " Tax ".to_string(),
                "tax".to_string(),
                "HOME".to_string(),
                String::new(),
            ],
            ..RawDocumentFields::default()
        });

        assert_eq!(fields.tags, vec!["tax".to_string(), "home".to_string()]);
    }
}
