use auth::AuthUser;
use axum::extract::multipart::MultipartError;
use axum::extract::{Multipart, State};
use axum::http::StatusCode;
use backend_utils::app_result::ApiResult;
use backend_utils::{AppError, AppResponse};
use chrono::Utc;

use crate::application::document::extract_document_fields_command::{
    ExtractDocumentFieldsCommand, ExtractDocumentFieldsInput,
};
use crate::application::document::get_extraction_limits_query::GetExtractionLimitsQuery;
use crate::infrastructure::document::document_extraction_api_types::{
    ExtractedDocumentFieldsDto, ExtractionLimitsDto,
};
use crate::infrastructure::document::document_state::DocumentState;

const FILE_FIELD_NAME: &str = "file";

/// Returns the extraction limits and the units the user has left today (UTC).
/// The limits are read from the database on each request.
///
/// ```text
/// Client -> get_extraction_limits : GET /documents/extract/limits
/// get_extraction_limits -> GetExtractionLimitsQuery : execute(user_id, UTC today)
/// GetExtractionLimitsQuery -> ExtractionLimitsReader : load
///   alt row missing
///     GetExtractionLimitsQuery --> Client : 503 "Extraction is not configured"
/// GetExtractionLimitsQuery -> ExtractionUsage : used_today
/// get_extraction_limits --> Client : 200 ExtractionLimitsDto
/// ```
pub async fn get_extraction_limits(
    AuthUser { user_id, .. }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
) -> ApiResult<ExtractionLimitsDto> {
    let view = GetExtractionLimitsQuery::new(
        document_use_cases.extraction_limits_reader.clone(),
        document_use_cases.extraction_usage.clone(),
        user_id,
        Utc::now().date_naive(),
    )
    .execute()
    .await?;
    AppResponse::ok(ExtractionLimitsDto::from_view(&view))
}

/// Reads Document form fields from one uploaded image or PDF. Stores nothing.
///
/// ```text
/// Client -> extract_document_fields : POST /documents/extract (multipart, part "file")
/// extract_document_fields -> extract_document_fields : read_file_part
///   alt no "file" part / read error
///     extract_document_fields --> Client : 400 (413 when the body is too large)
/// extract_document_fields -> ExtractDocumentFieldsCommand : execute(user_id, bytes, UTC today)
///   ExtractDocumentFieldsCommand -> ExtractionLimitsReader : load
///   ExtractDocumentFieldsCommand -> PdfReader : embedded_text / first_pages (PDF only)
///   ExtractDocumentFieldsCommand -> ExtractionUsage : reserve
///   ExtractDocumentFieldsCommand -> DocumentExtractor : extract (Gemini)
///   ExtractDocumentFieldsCommand --> extract_document_fields : fields | AppError
/// extract_document_fields --> Client : 200 ExtractedDocumentFieldsDto
///                                      | 400 / 413 / 429 / 502 / 503 / 504
/// ```
pub async fn extract_document_fields(
    AuthUser { user_id, .. }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
    multipart: Multipart,
) -> ApiResult<ExtractedDocumentFieldsDto> {
    let file_bytes = read_file_part(multipart).await?;
    let fields = ExtractDocumentFieldsCommand::new(
        ExtractDocumentFieldsInput {
            user_id,
            file_bytes,
            today: Utc::now().date_naive(),
        },
        document_use_cases.extraction_limits_reader.clone(),
        document_use_cases.extraction_usage.clone(),
        document_use_cases.document_extractor.clone(),
        document_use_cases.pdf_reader.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(ExtractedDocumentFieldsDto::from_domain(fields))
}

/// Returns the bytes of the first part named `file`. Other parts are skipped.
async fn read_file_part(mut multipart: Multipart) -> Result<Vec<u8>, AppError> {
    while let Some(field) = multipart.next_field().await.map_err(map_multipart_error)? {
        if field.name() != Some(FILE_FIELD_NAME) {
            continue;
        }
        let bytes = field.bytes().await.map_err(map_multipart_error)?;
        return Ok(bytes.to_vec());
    }
    Err(AppError::Validation(
        "Add a file part named file.".to_string(),
    ))
}

fn map_multipart_error(error: MultipartError) -> AppError {
    if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
        return AppError::PayloadTooLarge("The upload is too large.".to_string());
    }
    tracing::warn!("Cannot read the extract upload: {}", error.body_text());
    AppError::Validation("Could not read the uploaded file.".to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::{Body, to_bytes};
    use axum::extract::FromRequest;
    use axum::http::Request;
    use axum::response::IntoResponse;
    use uuid::Uuid;

    use crate::application::document::document_repository::tests::DocumentCollection;
    use crate::application::document::document_use_cases::DocumentUseCases;
    use crate::domain::document::document_extractor::RawDocumentFields;
    use crate::domain::document::document_extractor::tests::FakeDocumentExtractor;
    use crate::domain::document::extraction_limits::ExtractionLimits;
    use crate::domain::document::extraction_limits::tests::{FixedExtractionLimits, SEEDED_LIMITS};
    use crate::domain::document::extraction_usage::tests::InMemoryExtractionUsage;
    use crate::domain::document::pdf_reader::tests::FakePdfReader;

    use super::*;

    fn state_with_limits(limits: Option<ExtractionLimits>) -> State<DocumentState> {
        State(DocumentState(Arc::new(DocumentUseCases {
            document_repository: Arc::new(DocumentCollection::new()),
            extraction_limits_reader: Arc::new(FixedExtractionLimits(limits)),
            extraction_usage: Arc::new(InMemoryExtractionUsage::new()),
            document_extractor: None,
            pdf_reader: Arc::new(FakePdfReader::unreadable()),
        })))
    }

    fn auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "test-tenant".to_string(),
        }
    }

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read body");
        serde_json::from_slice(&bytes).expect("json body")
    }

    #[tokio::test]
    async fn given_seeded_limits_when_get_then_200_with_values() {
        let response = get_extraction_limits(auth_user(), state_with_limits(Some(SEEDED_LIMITS)))
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::OK);
        let body: ExtractionLimitsDto =
            serde_json::from_value(body_json(response).await).expect("dto");
        assert_eq!(
            body,
            ExtractionLimitsDto {
                daily_limit_per_user: 20,
                remaining_today: 20,
                max_file_bytes: 10_485_760,
                max_pdf_pages: 5,
            }
        );
    }

    #[tokio::test]
    async fn given_missing_limits_row_when_get_then_503() {
        let response = get_extraction_limits(auth_user(), state_with_limits(None))
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(response).await;
        assert_eq!(body["message"], "Extraction is not configured");
    }

    fn state_with_extractor() -> State<DocumentState> {
        let raw_fields = RawDocumentFields {
            title: Some(" Passport ".to_string()),
            content: None,
            tags: vec!["ID".to_string()],
            issued_date: Some("2020-05-01".to_string()),
            expire_date: Some("2030-05-01".to_string()),
        };
        State(DocumentState(Arc::new(DocumentUseCases {
            document_repository: Arc::new(DocumentCollection::new()),
            extraction_limits_reader: Arc::new(FixedExtractionLimits(Some(SEEDED_LIMITS))),
            extraction_usage: Arc::new(InMemoryExtractionUsage::new()),
            document_extractor: Some(Arc::new(FakeDocumentExtractor::returning(Ok(raw_fields)))),
            pdf_reader: Arc::new(FakePdfReader::unreadable()),
        })))
    }

    async fn multipart_with_part(name: &str, content: &[u8]) -> Multipart {
        let mut body = format!(
            "--boundary\r\nContent-Disposition: form-data; name=\"{name}\"; \
             filename=\"upload.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .into_bytes();
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n--boundary--\r\n");
        let request = Request::builder()
            .header("content-type", "multipart/form-data; boundary=boundary")
            .body(Body::from(body))
            .expect("request");
        Multipart::from_request(request, &())
            .await
            .expect("multipart")
    }

    #[tokio::test]
    async fn given_jpeg_file_part_when_extract_then_200_with_fields() {
        let multipart = multipart_with_part("file", &[0xFF, 0xD8, 0xFF, 0xE0, 0x00]).await;

        let response = extract_document_fields(auth_user(), state_with_extractor(), multipart)
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::OK);
        let body: ExtractedDocumentFieldsDto =
            serde_json::from_value(body_json(response).await).expect("dto");
        assert_eq!(
            body,
            ExtractedDocumentFieldsDto {
                title: Some("Passport".to_string()),
                content: None,
                tags: vec!["id".to_string()],
                issued_date: chrono::NaiveDate::from_ymd_opt(2020, 5, 1),
                expire_date: chrono::NaiveDate::from_ymd_opt(2030, 5, 1),
            }
        );
    }

    #[tokio::test]
    async fn given_no_file_part_when_extract_then_400() {
        let multipart = multipart_with_part("other", b"ignored").await;

        let response = extract_document_fields(auth_user(), state_with_extractor(), multipart)
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = body_json(response).await;
        assert_eq!(body["message"], "Add a file part named file.");
    }
}
