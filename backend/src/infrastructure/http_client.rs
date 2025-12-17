use async_trait::async_trait;
use reqwest::{Response, multipart::Form};

#[async_trait]
pub trait HttpClient: Send + Sync {
    async fn post_multipart(
        &self,
        url: &str,
        form: Form,
    ) -> Result<Response, Box<dyn std::error::Error>>;
}
