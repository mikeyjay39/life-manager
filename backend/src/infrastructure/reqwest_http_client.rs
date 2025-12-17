use reqwest::{Response, multipart::Form};

use crate::infrastructure::http_client::HttpClient;

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

impl HttpClient for ReqwestHttpClient {
    async fn post_multipart(
        &self,
        url: &str,
        form: Form,
    ) -> Result<Response, Box<dyn std::error::Error>> {
        let response = self.client.post(url).multipart(form).send().await;
        match response {
            Ok(resp) => response,
            Err(e) => {
                tracing::error!("Error sending request to Tesseract service: {}", e);
                return Err(Box::new(e));
            }
        }
    }
}
