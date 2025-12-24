use std::{error::Error, sync::Arc};

use reqwest::multipart::{Form, Part};
use serde_json::json;

use crate::{
    domain::document_text_reader::DocumentTextReader,
    infrastructure::http_client::{HttpClient, HttpResponse},
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

impl DocumentTextReader for TesseractAdapter {
    async fn read_image(&self, bytes: &[u8]) -> Result<String, Box<dyn Error>> {
        // Build the JSON options exactly like the curl example
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
                    .file_name("file.jpeg") // required by many servers
                    .mime_str("image/jpeg")?,
            );

        tracing::info!("Sending request to Tesseract service at: ");
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

    use crate::{
        domain::document_text_reader::DocumentTextReader,
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
        use std::fs::File;
        use std::io::Read;
        use std::path::PathBuf;

        // TODO: Move this image to the test resources directory
        let path = PathBuf::from("/home/mikeyjay/Downloads/hello_world.png");
        let mut file = File::open(path).expect("Failed to open the file");
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .expect("Failed to read the file");
        let adapter = super::TesseractAdapter::new(
            "http://localhost:8884".to_string(),
            Arc::new(MockHttpClient::new()),
        );
        let result = adapter.read_image(&buffer).await;
        let text = match result {
            Ok(text) => {
                println!("OCR Result: {}", text);
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
