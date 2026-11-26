#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use std::env::{remove_var, set_var};

use axum_test::TestServer;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use deadpool_diesel::sqlite::Pool;
use diesel::RunQueryDsl;
use life_manager::infrastructure::document::document_dto::DocumentDto;
use life_manager::infrastructure::document::document_extraction_api_types::{
    ExtractedDocumentFieldsDto, ExtractionLimitsDto,
};
use lopdf::{Document as PdfDocument, Object, Stream, dictionary};
use reqwest::StatusCode;
use reqwest::multipart::{Form, Part};
use serde_json::{Value, json};
use serial_test::serial;
use tracing_test::traced_test;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::common::captured_logs::CapturedLogs;
use crate::common::setup::{build_auth_header, run_test_with_test_profile_and_db_setup};

const EXTRACT_URL: &str = "/life-manager/api/v1/documents/extract";
const LIMITS_URL: &str = "/life-manager/api/v1/documents/extract/limits";
const DOCUMENTS_URL: &str = "/life-manager/api/v1/documents";
const GEMINI_PATH: &str = "/v1beta/models/test-model:generateContent";
const TEST_API_KEY: &str = "test-key";
const HELLO_WORLD_PDF: &[u8] = include_bytes!("resources/hello_world.pdf");
const EXTRACTED_CONTENT: &str = "Summary of the car insurance policy";

/// Points the app at the stub Gemini server. The app reads these variables
/// when it builds its state, so call this before the server starts.
fn enable_gemini(gemini: &MockServer) {
    unsafe {
        set_var("GEMINI_API_KEY", TEST_API_KEY);
        set_var("GEMINI_MODEL", "test-model");
        set_var("GEMINI_API_BASE_URL", gemini.uri());
    }
}

fn disable_gemini() {
    unsafe {
        remove_var("GEMINI_API_KEY");
    }
}

fn gemini_body(fields_text: &str) -> Value {
    json!({ "candidates": [{ "content": { "parts": [{ "text": fields_text }] } }] })
}

fn valid_fields_text() -> String {
    json!({
        "title": "Car insurance policy",
        "content": EXTRACTED_CONTENT,
        "tags": ["Insurance", "car"],
        "issued_date": "2026-01-15",
        "expire_date": "2027-02-30",
    })
    .to_string()
}

async fn mount_gemini(gemini: &MockServer, response: ResponseTemplate) {
    Mock::given(method("POST"))
        .and(path(GEMINI_PATH))
        .and(header("x-goog-api-key", TEST_API_KEY))
        .respond_with(response)
        .mount(gemini)
        .await;
}

async fn mount_valid_gemini(gemini: &MockServer) {
    mount_gemini(
        gemini,
        ResponseTemplate::new(200).set_body_json(gemini_body(&valid_fields_text())),
    )
    .await;
}

async fn received_bodies(gemini: &MockServer) -> Vec<Value> {
    gemini
        .received_requests()
        .await
        .expect("request recording is on")
        .iter()
        .map(|request| serde_json::from_slice(&request.body).expect("json request"))
        .collect()
}

fn source_part(body: &Value) -> &Value {
    &body["contents"][0]["parts"][1]
}

async fn post_extract(server: &TestServer, auth_header: &str, form: Form) -> reqwest::Response {
    let url = server.server_url(EXTRACT_URL).expect("extract url");
    reqwest::Client::new()
        .post(url.as_str())
        .header("Authorization", auth_header)
        .multipart(form)
        .send()
        .await
        .expect("post extract")
}

async fn post_file(server: &TestServer, auth_header: &str, bytes: Vec<u8>) -> reqwest::Response {
    let form = Form::new().part("file", Part::bytes(bytes).file_name("upload.bin"));
    post_extract(server, auth_header, form).await
}

async fn assert_error(response: reqwest::Response, status: StatusCode, message: &str) {
    assert_eq!(response.status(), status);
    let body: Value = response.json().await.expect("error json");
    assert_eq!(body["message"], message);
}

async fn remaining_today(server: &TestServer, auth_header: &str) -> u32 {
    let url = server.server_url(LIMITS_URL).expect("limits url");
    let response = reqwest::Client::new()
        .get(url.as_str())
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("get limits");
    assert_eq!(response.status(), StatusCode::OK);
    let limits: ExtractionLimitsDto = response.json().await.expect("limits json");
    limits.remaining_today
}

async fn list_documents(server: &TestServer, auth_header: &str) -> Vec<DocumentDto> {
    let url = server.server_url(DOCUMENTS_URL).expect("documents url");
    let response = reqwest::Client::new()
        .get(url.as_str())
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("get documents");
    assert_eq!(response.status(), StatusCode::OK);
    response.json().await.expect("documents json")
}

async fn execute_sql(pool: &Pool, sql: &'static str) {
    let conn = pool.get().await.expect("pool connection");
    conn.interact(move |conn| diesel::sql_query(sql).execute(conn))
        .await
        .expect("interact")
        .expect("execute sql");
}

/// Runs `test` against a server whose limits row was changed by `limits_sql`.
async fn run_with_limits<F, Fut>(limits_sql: Option<&'static str>, test: F)
where
    F: FnOnce(TestServer) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    run_test_with_test_profile_and_db_setup(
        |pool| async move {
            if let Some(sql) = limits_sql {
                execute_sql(&pool, sql).await;
            }
        },
        test,
    )
    .await;
}

fn jpeg_bytes() -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
    bytes.resize(1024, 0);
    bytes
}

/// Builds a PDF with `pages` empty pages and no text, like a scan with no OCR layer.
fn build_blank_pdf(pages: u32) -> Vec<u8> {
    let mut document = PdfDocument::with_version("1.5");
    let pages_id = document.new_object_id();
    let kids: Vec<Object> = (0..pages)
        .map(|_| {
            let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
            document
                .add_object(dictionary! {
                    "Type" => "Page",
                    "Parent" => pages_id,
                    "Contents" => content_id,
                    "Resources" => dictionary! {},
                    "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
                })
                .into()
        })
        .collect();
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => i64::from(pages),
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).expect("save blank pdf");
    bytes
}

// No `traced_test`: its global subscriber would hide the life_manager log line.
#[tokio::test]
#[serial]
async fn given_jpeg_when_extract_then_200_with_fields_and_no_document_stored() {
    let logs = CapturedLogs::default();
    let _subscriber_guard = logs.capture(tracing::Level::INFO);
    let gemini = MockServer::start().await;
    mount_valid_gemini(&gemini).await;
    enable_gemini(&gemini);

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let response = post_file(&server, &auth_header, jpeg_bytes()).await;

        assert_eq!(response.status(), StatusCode::OK);
        let fields: ExtractedDocumentFieldsDto = response.json().await.expect("fields json");
        assert_eq!(
            fields,
            ExtractedDocumentFieldsDto {
                title: Some("Car insurance policy".to_string()),
                content: Some(EXTRACTED_CONTENT.to_string()),
                tags: vec!["insurance".to_string(), "car".to_string()],
                issued_date: chrono::NaiveDate::from_ymd_opt(2026, 1, 15),
                expire_date: None,
            }
        );
        assert!(list_documents(&server, &auth_header).await.is_empty());
        assert_eq!(remaining_today(&server, &auth_header).await, 19);
        let bodies = received_bodies(&gemini).await;
        assert_eq!(bodies.len(), 1);
        assert_eq!(
            source_part(&bodies[0])["inline_data"]["mime_type"],
            "image/jpeg"
        );
    })
    .await;

    let log_text = logs.text();
    let line = log_text
        .lines()
        .find(|line| line.contains("Document extraction finished"))
        .expect("extraction log line");
    for field in [
        "user_id=",
        "media_type=\"image/jpeg\"",
        "size_bytes=1024",
        "path=\"file\"",
        "latency_ms=",
        "status=\"ok\"",
    ] {
        assert!(line.contains(field), "log line {line:?} has no {field}");
    }
    assert!(
        !log_text.contains(TEST_API_KEY),
        "logs must not hold the API key"
    );
    assert!(
        !log_text.contains(EXTRACTED_CONTENT),
        "logs must not hold the extracted summary"
    );
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_pdf_with_text_when_extract_then_gemini_gets_text_and_no_inline_data() {
    let gemini = MockServer::start().await;
    mount_valid_gemini(&gemini).await;
    enable_gemini(&gemini);

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let response = post_file(&server, &auth_header, HELLO_WORLD_PDF.to_vec()).await;

        assert_eq!(response.status(), StatusCode::OK);
        let bodies = received_bodies(&gemini).await;
        assert_eq!(bodies.len(), 1);
        let body_text = bodies[0].to_string();
        assert!(!body_text.contains("inline_data"), "no inline_data part");
        let text_part = source_part(&bodies[0])["text"].as_str().expect("text part");
        assert!(text_part.starts_with("Document text:\n"));
        assert!(text_part.to_lowercase().contains("hello"), "{text_part:?}");
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_scanned_12_page_pdf_when_extract_then_gemini_gets_5_page_pdf() {
    let gemini = MockServer::start().await;
    mount_valid_gemini(&gemini).await;
    enable_gemini(&gemini);

    run_with_limits(
        Some("UPDATE document_extraction_limits SET max_pdf_pages = 5 WHERE id = 1"),
        |server: TestServer| async move {
            let auth_header = build_auth_header(&server).await;

            let response = post_file(&server, &auth_header, build_blank_pdf(12)).await;

            assert_eq!(response.status(), StatusCode::OK);
            let bodies = received_bodies(&gemini).await;
            assert_eq!(bodies.len(), 1);
            let inline_data = &source_part(&bodies[0])["inline_data"];
            assert_eq!(inline_data["mime_type"], "application/pdf");
            let pdf_bytes = BASE64_STANDARD
                .decode(inline_data["data"].as_str().expect("base64 data"))
                .expect("valid base64");
            let pdf = PdfDocument::load_mem(&pdf_bytes).expect("valid pdf");
            assert_eq!(pdf.get_pages().len(), 5);
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_1_mb_limit_when_2_mb_image_then_413_and_usage_unchanged() {
    let gemini = MockServer::start().await;
    mount_valid_gemini(&gemini).await;
    enable_gemini(&gemini);

    run_with_limits(
        Some("UPDATE document_extraction_limits SET max_file_bytes = 1048576 WHERE id = 1"),
        |server: TestServer| async move {
            let auth_header = build_auth_header(&server).await;
            let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
            png.resize(2 * 1024 * 1024, 0);

            let response = post_file(&server, &auth_header, png).await;

            assert_error(
                response,
                StatusCode::PAYLOAD_TOO_LARGE,
                "The file is larger than 1 MB.",
            )
            .await;
            assert_eq!(remaining_today(&server, &auth_header).await, 20);
            assert!(received_bodies(&gemini).await.is_empty());
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_all_units_used_when_extract_then_429_and_gemini_not_called_again() {
    let gemini = MockServer::start().await;
    mount_valid_gemini(&gemini).await;
    enable_gemini(&gemini);

    run_with_limits(
        Some("UPDATE document_extraction_limits SET daily_limit_per_user = 1 WHERE id = 1"),
        |server: TestServer| async move {
            let auth_header = build_auth_header(&server).await;
            let first = post_file(&server, &auth_header, jpeg_bytes()).await;
            assert_eq!(first.status(), StatusCode::OK);

            let second = post_file(&server, &auth_header, jpeg_bytes()).await;

            assert_error(
                second,
                StatusCode::TOO_MANY_REQUESTS,
                "You have no extractions left today.",
            )
            .await;
            assert_eq!(received_bodies(&gemini).await.len(), 1);
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_gemini_returns_429_when_extract_then_429_shared_quota_and_unit_counted() {
    let gemini = MockServer::start().await;
    mount_gemini(&gemini, ResponseTemplate::new(429)).await;
    enable_gemini(&gemini);

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let response = post_file(&server, &auth_header, jpeg_bytes()).await;

        assert_error(
            response,
            StatusCode::TOO_MANY_REQUESTS,
            "The shared extraction quota is used up. Try again later.",
        )
        .await;
        assert_eq!(remaining_today(&server, &auth_header).await, 19);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_gemini_returns_500_when_extract_then_502_and_unit_counted() {
    let gemini = MockServer::start().await;
    mount_gemini(&gemini, ResponseTemplate::new(500)).await;
    enable_gemini(&gemini);

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let response = post_file(&server, &auth_header, jpeg_bytes()).await;

        assert_error(
            response,
            StatusCode::BAD_GATEWAY,
            "Extraction failed. Try again later.",
        )
        .await;
        assert_eq!(remaining_today(&server, &auth_header).await, 19);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_gemini_text_not_json_when_extract_then_502_and_unit_counted() {
    let gemini = MockServer::start().await;
    mount_gemini(
        &gemini,
        ResponseTemplate::new(200).set_body_json(gemini_body("not json")),
    )
    .await;
    enable_gemini(&gemini);

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let response = post_file(&server, &auth_header, jpeg_bytes()).await;

        assert_error(
            response,
            StatusCode::BAD_GATEWAY,
            "Extraction returned an invalid response.",
        )
        .await;
        assert_eq!(remaining_today(&server, &auth_header).await, 19);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_gemini_api_key_when_extract_then_503() {
    disable_gemini();

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let response = post_file(&server, &auth_header, jpeg_bytes()).await;

        assert_error(
            response,
            StatusCode::SERVICE_UNAVAILABLE,
            "Extraction is not available.",
        )
        .await;
        assert_eq!(remaining_today(&server, &auth_header).await, 20);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_bad_uploads_when_extract_then_400_and_usage_unchanged() {
    let gemini = MockServer::start().await;
    mount_valid_gemini(&gemini).await;
    enable_gemini(&gemini);

    run_with_limits(None, |server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let no_file = Form::new().text("note", "no file here");
        assert_error(
            post_extract(&server, &auth_header, no_file).await,
            StatusCode::BAD_REQUEST,
            "Add a file part named file.",
        )
        .await;
        assert_error(
            post_file(&server, &auth_header, Vec::new()).await,
            StatusCode::BAD_REQUEST,
            "The file is empty.",
        )
        .await;
        assert_error(
            post_file(&server, &auth_header, b"plain text notes\n".to_vec()).await,
            StatusCode::BAD_REQUEST,
            "Unsupported file type. Use PNG, JPEG, WebP, HEIC, or PDF.",
        )
        .await;
        assert_error(
            post_file(&server, &auth_header, b"%PDF-1.7\nnot a real pdf".to_vec()).await,
            StatusCode::BAD_REQUEST,
            "Cannot read this PDF",
        )
        .await;

        assert_eq!(remaining_today(&server, &auth_header).await, 20);
        assert!(received_bodies(&gemini).await.is_empty());
    })
    .await;
}
