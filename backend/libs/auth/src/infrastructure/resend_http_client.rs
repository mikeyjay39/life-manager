use async_trait::async_trait;
use serde_json::Value;

/// Minimal HTTP response for Resend JSON posts.
#[derive(Debug, Clone)]
pub struct ResendHttpResponse {
    pub status: u16,
    pub body: String,
}

/// Port for Resend HTTPS calls. Keeps reqwest out of unit tests.
#[async_trait]
pub trait ResendHttpClient: Send + Sync {
    async fn post_json(
        &self,
        url: &str,
        api_key: &str,
        body: &Value,
    ) -> Result<ResendHttpResponse, String>;
}

/// reqwest adapter for the Resend emails API.
pub struct ReqwestResendHttpClient {
    client: reqwest::Client,
}

impl ReqwestResendHttpClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

impl Default for ReqwestResendHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ResendHttpClient for ReqwestResendHttpClient {
    async fn post_json(
        &self,
        url: &str,
        api_key: &str,
        body: &Value,
    ) -> Result<ResendHttpResponse, String> {
        let response = self
            .client
            .post(url)
            .bearer_auth(api_key)
            .json(body)
            .send()
            .await
            .map_err(|err| format!("Resend HTTP request failed: {err}"))?;

        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .map_err(|err| format!("Failed to read Resend response body: {err}"))?;
        Ok(ResendHttpResponse { status, body })
    }
}
