use async_trait::async_trait;
use reqwest::multipart::Form;

#[derive(Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

/**
* Port for making HTTP requests.
*/
#[async_trait]
pub trait HttpClient: Send + Sync {
    async fn post_multipart(
        &self,
        url: &str,
        form: Form,
    ) -> Result<HttpResponse, Box<dyn std::error::Error + Send + Sync>>;
}
