use std::{error::Error, sync::Arc};

use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde_json::json;

use crate::{
    domain::{
        document_text_reader::DocumentTextReader, uploaded_document_input::UploadedDocumentInput,
    },
    infrastructure::{
        document_text_extraction::{get_text_from_pdf, needs_ocr},
        http_client::{HttpClient, HttpResponse},
    },
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
struct TesseractResponse {
    data: TesseractData,
}

#[derive(Debug, Deserialize, Serialize)]
struct TesseractData {
    stdout: String,
    stderr: String,
}

#[derive(Clone)]
pub struct TesseractAdapter {
    url: String,
    http_client: Arc<dyn HttpClient>,
}

impl TesseractAdapter {
    pub fn new(url: String, http_client: Arc<dyn HttpClient + Send + Sync>) -> Self {
        Self {
            url: format!("{}/tesseract", url),
            http_client,
        }
    }
}

#[async_trait]
impl DocumentTextReader for TesseractAdapter {
    async fn read_image(
        &self,
        uploaded_document_input: &UploadedDocumentInput,
    ) -> Result<String, Box<dyn Error>> {
        // If it's a PDF, try to extract text without OCR first
        if uploaded_document_input.is_pdf() {
            tracing::info!("File '{}' is a PDF.", uploaded_document_input.file_name);
            match get_text_from_pdf(uploaded_document_input)? {
                Some(text) => {
                    tracing::info!("Extracted text from PDF without OCR.");
                    return Ok(text);
                }
                None => {
                    tracing::info!(
                        "No text extracted from PDF, proceeding with OCR for file '{}'.",
                        uploaded_document_input.file_name
                    );
                }
            }
        }

        if !needs_ocr(uploaded_document_input) {
            tracing::info!(
                "File '{}' does not need OCR.",
                uploaded_document_input.file_name
            );
            return Ok(String::new());
        }

        let bytes = &uploaded_document_input.file_data;
        let options = json!({
            "languages": ["eng"]
        })
        .to_string();

        // Build multipart form
        let form = Form::new()
            .part("options", Part::text(options).mime_str("application/json")?)
            .part(
                "file",
                Part::bytes(bytes.to_vec())
                    .file_name(uploaded_document_input.file_name.clone())
                    .mime_str("image/jpeg")?, // TODO: clean this up
            );

        tracing::info!("Sending request to Tesseract service at: {}", self.url);
        let response = self.http_client.post_multipart(&self.url, form).await;

        let response: HttpResponse = match response {
            Ok(resp) => resp,
            Err(e) => {
                tracing::error!("HTTP request to Tesseract service failed: {}", e);
                return Err(e);
            }
        };

        let status = response.status;
        tracing::info!("Tesseract response status: {}", status);
        let body: TesseractResponse = match serde_json::from_slice(&response.body) {
            Ok(body) => body,
            Err(e) => {
                tracing::error!("Failed to parse Tesseract response JSON: {}", e);
                return Err(Box::new(e));
            }
        };
        tracing::info!("Tesseract stdout received: {}", body.data.stdout);

        Ok(body.data.stdout.trim().to_string())
    }
}

#[cfg(test)]
mod tests {

    use std::sync::Arc;

    use async_trait::async_trait;
    use serde_json::to_vec;
    use uuid::Uuid;

    use crate::{
        domain::{
            document_text_reader::DocumentTextReader,
            uploaded_document_input::UploadedDocumentInput,
        },
        infrastructure::{
            http_client::{HttpClient, HttpResponse},
            tesseract_adapter::{TesseractData, TesseractResponse},
        },
    };

    struct MockHttpClient;

    impl MockHttpClient {
        fn new() -> Self {
            MockHttpClient {}
        }
    }

    #[async_trait]
    impl HttpClient for MockHttpClient {
        async fn post_multipart(
            &self,
            _url: &str,
            _form: reqwest::multipart::Form,
        ) -> Result<HttpResponse, Box<dyn std::error::Error + Send + Sync>> {
            // Mock response
            let mock_tesseract_response = TesseractResponse {
                data: TesseractData {
                    stdout: "Hello World".to_string(),
                    stderr: "".to_string(),
                },
            };
            let body = match to_vec(&mock_tesseract_response) {
                Ok(b) => b,
                Err(e) => {
                    return Err(Box::new(e));
                }
            };

            Ok(HttpResponse { body, status: 200 })
        }
    }

    #[tokio::test]
    pub async fn test_read_image() {
        let file_name = "hello_world.png";
        let buffer = vec![0_u8, 1, 2];
        let adapter = super::TesseractAdapter::new(
            "http://localhost:8884".to_string(),
            Arc::new(MockHttpClient::new()),
        );
        let uploaded_document_input =
            UploadedDocumentInput::new(file_name.to_string(), buffer, Uuid::new_v4());
        let result = adapter.read_image(&uploaded_document_input).await;
        let text = match result {
            Ok(text) => {
                tracing::info!("OCR Result: {}", text);
                text
            }
            Err(e) => {
                panic!("OCR failed with error: {}", e);
            }
        };
        let txt = text.as_str();
        assert_eq!(txt.to_lowercase(), "Hello World".to_lowercase());
    }
}
