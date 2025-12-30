use async_trait::async_trait;
use reqwest::multipart::Form;

use crate::infrastructure::http_client::{HttpClient, HttpResponse};

pub struct ReqwestHttpClient {
    client: reqwest::Client,
}

impl ReqwestHttpClient {
    pub fn new() -> Self {
        ReqwestHttpClient {
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl HttpClient for ReqwestHttpClient {
    async fn post_multipart(
        &self,
        url: &str,
        form: Form,
    ) -> Result<HttpResponse, Box<dyn std::error::Error + Send + Sync>> {
        let response = self.client.post(url).multipart(form).send().await;
        match response {
            Ok(resp) => {
                let status: u16 = resp.status().as_u16();
                let body = resp
                    .bytes()
                    .await
                    .map_err(|e| {
                        tracing::error!("Failed to deserialize response: {}", e);
                        Box::new(e) as Box<dyn std::error::Error + Send + Sync>
                    })?
                    .to_vec();
                Ok(HttpResponse { status, body })
            }
            Err(e) => {
                tracing::error!("Error sending request to Tesseract service: {}", e);
                return Err(Box::new(e));
            }
        }
    }
}
