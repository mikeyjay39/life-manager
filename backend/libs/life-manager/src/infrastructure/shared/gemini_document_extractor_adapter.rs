//! `DocumentExtractor` adapter for the Gemini `generateContent` API.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use serde_json::{Value, json};

use crate::domain::document::document_extractor::{
    DocumentExtractionError, DocumentExtractor, ExtractionSource, RawDocumentFields,
};
use crate::infrastructure::shared::http_client::{
    HttpClient, HttpClientError, HttpResponse, JsonPostRequest,
};

pub const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-flash-lite";
pub const DEFAULT_GEMINI_API_BASE_URL: &str = "https://generativelanguage.googleapis.com";
const GEMINI_TIMEOUT: Duration = Duration::from_secs(30);
const HTTP_TOO_MANY_REQUESTS: u16 = 429;

const EXTRACTION_PROMPT: &str = "You fill in a form for a personal document. \
Read the attached document and return these fields: \
title: a short title of at most 10 words; \
content: a summary of at most 200 characters; \
tags: up to 5 short lowercase tags; \
issued_date: the date the document was issued, as YYYY-MM-DD; \
expire_date: the date the document expires, as YYYY-MM-DD. \
Use null for a field that you cannot find, and an empty list when you find no tags. \
Keep the language of the document. Do not translate.";

/// Gemini settings. The API key is a secret: never log it.
#[derive(Clone)]
pub struct GeminiConfig {
    pub api_key: String,
    pub model: String,
    pub base_url: String,
}

impl GeminiConfig {
    /// Returns `None` when `GEMINI_API_KEY` is not set or is blank.
    /// Extraction is then off and the endpoint returns 503.
    pub fn from_env() -> Option<Self> {
        Self::from_values(
            std::env::var("GEMINI_API_KEY").ok(),
            std::env::var("GEMINI_MODEL").ok(),
            std::env::var("GEMINI_API_BASE_URL").ok(),
        )
    }

    pub fn from_values(
        api_key: Option<String>,
        model: Option<String>,
        base_url: Option<String>,
    ) -> Option<Self> {
        let api_key = non_blank(api_key)?;
        Some(Self {
            api_key,
            model: non_blank(model).unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string()),
            base_url: non_blank(base_url)
                .unwrap_or_else(|| DEFAULT_GEMINI_API_BASE_URL.to_string())
                .trim_end_matches('/')
                .to_string(),
        })
    }
}

fn non_blank(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    Some(value)
}

pub struct GeminiDocumentExtractorAdapter {
    config: GeminiConfig,
    http_client: Arc<dyn HttpClient>,
}

impl GeminiDocumentExtractorAdapter {
    pub fn new(config: GeminiConfig, http_client: Arc<dyn HttpClient>) -> Self {
        Self {
            config,
            http_client,
        }
    }

    fn build_request(&self, source: &ExtractionSource) -> JsonPostRequest {
        JsonPostRequest {
            url: format!(
                "{}/v1beta/models/{}:generateContent",
                self.config.base_url, self.config.model
            ),
            headers: vec![
                ("x-goog-api-key".to_string(), self.config.api_key.clone()),
                ("Content-Type".to_string(), "application/json".to_string()),
            ],
            body: build_request_body(source),
            timeout: GEMINI_TIMEOUT,
        }
    }
}

#[async_trait]
impl DocumentExtractor for GeminiDocumentExtractorAdapter {
    /// One request, no retry. A retry would use more of the shared quota.
    async fn extract(
        &self,
        source: ExtractionSource,
    ) -> Result<RawDocumentFields, DocumentExtractionError> {
        let request = self.build_request(&source);
        let response = self
            .http_client
            .post_json(request)
            .await
            .map_err(map_client_error)?;
        parse_response(&response)
    }
}

fn build_request_body(source: &ExtractionSource) -> Value {
    json!({
        "contents": [{
            "role": "user",
            "parts": [{ "text": EXTRACTION_PROMPT }, source_part(source)],
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": response_schema(),
        },
    })
}

fn source_part(source: &ExtractionSource) -> Value {
    match source {
        ExtractionSource::Text(text) => json!({ "text": format!("Document text:\n{text}") }),
        ExtractionSource::File { bytes, media_type } => json!({
            "inline_data": {
                "mime_type": media_type.mime_type(),
                "data": BASE64_STANDARD.encode(bytes),
            },
        }),
    }
}

fn response_schema() -> Value {
    let nullable_string = json!({ "type": "STRING", "nullable": true });
    json!({
        "type": "OBJECT",
        "properties": {
            "title": nullable_string,
            "content": nullable_string,
            "tags": { "type": "ARRAY", "items": { "type": "STRING" } },
            "issued_date": nullable_string,
            "expire_date": nullable_string,
        },
        "required": ["title", "content", "tags", "issued_date", "expire_date"],
    })
}

fn map_client_error(error: HttpClientError) -> DocumentExtractionError {
    match error {
        HttpClientError::Timeout => DocumentExtractionError::Timeout,
        HttpClientError::Transport(detail) => DocumentExtractionError::Provider(detail),
    }
}

/// Reads `candidates[0].content.parts[0].text` and parses it as the fields JSON.
/// Error details hold parse errors and statuses only, not the model text.
fn parse_response(response: &HttpResponse) -> Result<RawDocumentFields, DocumentExtractionError> {
    if response.status == HTTP_TOO_MANY_REQUESTS {
        return Err(DocumentExtractionError::QuotaExceeded);
    }
    if !(200..300).contains(&response.status) {
        return Err(DocumentExtractionError::Provider(format!(
            "status {}",
            response.status
        )));
    }
    let envelope: Value = serde_json::from_slice(&response.body).map_err(|err| {
        DocumentExtractionError::InvalidResponse(format!("response is not JSON: {err}"))
    })?;
    let fields_json = envelope
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            DocumentExtractionError::InvalidResponse("response has no candidate text".to_string())
        })?;
    serde_json::from_str::<RawDocumentFields>(fields_json).map_err(|err| {
        DocumentExtractionError::InvalidResponse(format!(
            "candidate text is not fields JSON: {err}"
        ))
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use crate::domain::document::extraction_media_type::ExtractionMediaType;

    use super::*;

    /// `HttpClient` that records each request and returns one configured result.
    struct MockHttpClient {
        result: Mutex<Option<Result<HttpResponse, HttpClientError>>>,
        requests: Mutex<Vec<JsonPostRequest>>,
    }

    impl MockHttpClient {
        fn returning(result: Result<HttpResponse, HttpClientError>) -> Arc<Self> {
            Arc::new(Self {
                result: Mutex::new(Some(result)),
                requests: Mutex::new(Vec::new()),
            })
        }

        fn ok(status: u16, body: &str) -> Arc<Self> {
            Self::returning(Ok(HttpResponse {
                status,
                body: body.as_bytes().to_vec(),
            }))
        }

        fn only_request(&self) -> JsonPostRequest {
            let mut requests = self.requests.lock().expect("requests lock");
            assert_eq!(requests.len(), 1, "expected exactly one request");
            requests.remove(0)
        }
    }

    #[async_trait]
    impl HttpClient for MockHttpClient {
        async fn post_json(
            &self,
            request: JsonPostRequest,
        ) -> Result<HttpResponse, HttpClientError> {
            self.requests.lock().expect("requests lock").push(request);
            self.result
                .lock()
                .expect("result lock")
                .take()
                .expect("one configured result")
        }
    }

    fn config() -> GeminiConfig {
        GeminiConfig {
            api_key: "secret-key".to_string(),
            model: "test-model".to_string(),
            base_url: "http://gemini.test".to_string(),
        }
    }

    fn candidate_body(fields_text: &str) -> String {
        json!({ "candidates": [{ "content": { "parts": [{ "text": fields_text }] } }] }).to_string()
    }

    fn valid_fields_body() -> String {
        candidate_body(
            &json!({
                "title": "Car insurance",
                "content": "Policy summary",
                "tags": ["insurance"],
                "issued_date": "2026-01-15",
                "expire_date": null,
            })
            .to_string(),
        )
    }

    async fn extract_with(
        http_client: Arc<MockHttpClient>,
        source: ExtractionSource,
    ) -> Result<RawDocumentFields, DocumentExtractionError> {
        GeminiDocumentExtractorAdapter::new(config(), http_client)
            .extract(source)
            .await
    }

    fn jpeg_source() -> ExtractionSource {
        ExtractionSource::File {
            bytes: vec![0xFF, 0xD8, 0xFF, 0xE0],
            media_type: ExtractionMediaType::Jpeg,
        }
    }

    #[tokio::test]
    async fn given_file_source_when_extract_then_request_has_url_key_config_and_inline_data() {
        let http_client = MockHttpClient::ok(200, &valid_fields_body());

        extract_with(http_client.clone(), jpeg_source())
            .await
            .expect("fields");

        let request = http_client.only_request();
        assert_eq!(
            request.url,
            "http://gemini.test/v1beta/models/test-model:generateContent"
        );
        assert!(
            request
                .headers
                .contains(&("x-goog-api-key".to_string(), "secret-key".to_string()))
        );
        assert_eq!(request.timeout, Duration::from_secs(30));
        let config = &request.body["generationConfig"];
        assert_eq!(config["responseMimeType"], "application/json");
        let properties = config["responseSchema"]["properties"]
            .as_object()
            .expect("schema properties");
        let mut names: Vec<&str> = properties.keys().map(String::as_str).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            vec!["content", "expire_date", "issued_date", "tags", "title"]
        );
        let parts = request.body["contents"][0]["parts"]
            .as_array()
            .expect("parts");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[1]["inline_data"]["mime_type"], "image/jpeg");
        assert_eq!(parts[1]["inline_data"]["data"], "/9j/4A==");
    }

    #[tokio::test]
    async fn given_text_source_when_extract_then_request_has_text_parts_only() {
        let http_client = MockHttpClient::ok(200, &valid_fields_body());

        extract_with(
            http_client.clone(),
            ExtractionSource::Text("Policy number 42".to_string()),
        )
        .await
        .expect("fields");

        let body = http_client.only_request().body;
        let parts = body["contents"][0]["parts"].as_array().expect("parts");
        assert!(parts.iter().all(|part| part.get("inline_data").is_none()));
        assert_eq!(parts[1]["text"], "Document text:\nPolicy number 42");
    }

    #[tokio::test]
    async fn given_200_with_fields_when_extract_then_returns_raw_fields() {
        let fields = extract_with(MockHttpClient::ok(200, &valid_fields_body()), jpeg_source())
            .await
            .expect("fields");

        assert_eq!(
            fields,
            RawDocumentFields {
                title: Some("Car insurance".to_string()),
                content: Some("Policy summary".to_string()),
                tags: vec!["insurance".to_string()],
                issued_date: Some("2026-01-15".to_string()),
                expire_date: None,
            }
        );
    }

    #[tokio::test]
    async fn given_429_when_extract_then_quota_exceeded() {
        let result = extract_with(MockHttpClient::ok(429, "{}"), jpeg_source()).await;

        assert_eq!(result, Err(DocumentExtractionError::QuotaExceeded));
    }

    #[tokio::test]
    async fn given_5xx_when_extract_then_provider_error() {
        let result = extract_with(MockHttpClient::ok(503, "busy"), jpeg_source()).await;

        assert_eq!(
            result,
            Err(DocumentExtractionError::Provider("status 503".to_string()))
        );
    }

    #[tokio::test]
    async fn given_timeout_when_extract_then_timeout() {
        let result = extract_with(
            MockHttpClient::returning(Err(HttpClientError::Timeout)),
            jpeg_source(),
        )
        .await;

        assert_eq!(result, Err(DocumentExtractionError::Timeout));
    }

    #[tokio::test]
    async fn given_transport_error_when_extract_then_provider_error() {
        let result = extract_with(
            MockHttpClient::returning(Err(HttpClientError::Transport("refused".to_string()))),
            jpeg_source(),
        )
        .await;

        assert!(matches!(result, Err(DocumentExtractionError::Provider(_))));
    }

    #[tokio::test]
    async fn given_candidate_text_not_json_when_extract_then_invalid_response() {
        let result = extract_with(
            MockHttpClient::ok(200, &candidate_body("not json")),
            jpeg_source(),
        )
        .await;

        assert!(matches!(
            result,
            Err(DocumentExtractionError::InvalidResponse(_))
        ));
    }

    #[tokio::test]
    async fn given_no_candidates_when_extract_then_invalid_response() {
        let result = extract_with(
            MockHttpClient::ok(200, "{\"candidates\":[]}"),
            jpeg_source(),
        )
        .await;

        assert!(matches!(
            result,
            Err(DocumentExtractionError::InvalidResponse(_))
        ));
    }

    #[test]
    fn given_no_or_blank_key_when_from_values_then_none() {
        assert!(GeminiConfig::from_values(None, None, None).is_none());
        assert!(GeminiConfig::from_values(Some("  ".to_string()), None, None).is_none());
    }

    #[test]
    fn given_key_only_when_from_values_then_defaults() {
        let config =
            GeminiConfig::from_values(Some("key".to_string()), None, None).expect("config");

        assert_eq!(config.model, "gemini-2.5-flash-lite");
        assert_eq!(config.base_url, "https://generativelanguage.googleapis.com");
    }

    #[test]
    fn given_overrides_when_from_values_then_used_and_trailing_slash_trimmed() {
        let config = GeminiConfig::from_values(
            Some("key".to_string()),
            Some("other-model".to_string()),
            Some("http://localhost:9000/".to_string()),
        )
        .expect("config");

        assert_eq!(config.model, "other-model");
        assert_eq!(config.base_url, "http://localhost:9000");
    }
}
