use std::error::Error;

use reqwest::multipart::{Form, Part};
use serde_json::json;

use crate::{
    domain::document_text_reader::DocumentTextReader, infrastructure::http_client::HttpClient,
};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct TesseractResponse {
    data: TesseractData,
}

#[derive(Debug, Deserialize)]
struct TesseractData {
    stdout: String,
    _stderr: String,
}
use std::sync::Arc;

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
        let response = self.http_client.post_multipart(&self.url, form).await?;

        let status = response.status();
        tracing::info!("Tesseract response status: {}", status);
        let parsed: TesseractResponse = response.json().await.map_err(|e| {
            tracing::error!("Failed to deserialize Tesseract response: {}", e);
            Box::new(e) as Box<dyn std::error::Error>
        })?;

        tracing::info!("Tesseract stdout received: {}", parsed.data.stdout);

        Ok(parsed.data.stdout.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        domain::document_text_reader::DocumentTextReader, infrastructure::http_client::HttpClient,
    };

    struct MockHttpClient;

    impl HttpClient for MockHttpClient {
        async fn post_multipart(
            // FIXME:
            &self,
            _url: &str,
            _form: reqwest::multipart::Form,
        ) -> Result<reqwest::Response, Box<dyn std::error::Error>> {
            // Mock response
            let mock_response = r#"
            {
                "data": {
                    "stdout": "Hello World",
                    "_stderr": ""
                }
            }
            "#;

            let response = reqwest::Response::from(
                Response::builder().status(200).body(mock_response).unwrap(), // FIXME:
            );

            Ok(response)
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
        let adapter =
            super::TesseractAdapter::new("http://localhost:8884".to_string(), MockHttpClient);
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
