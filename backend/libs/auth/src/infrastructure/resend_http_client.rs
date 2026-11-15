use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;

/// Bound Resend HTTP calls so a hung provider cannot stall workers forever.
const RESEND_HTTP_TIMEOUT: Duration = Duration::from_secs(15);

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
    pub fn new() -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(RESEND_HTTP_TIMEOUT)
            .connect_timeout(RESEND_HTTP_TIMEOUT)
            .build()
            .map_err(|err| anyhow::anyhow!("Failed to build Resend HTTP client: {err}"))?;
        Ok(Self { client })
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

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{bearer_token, body_json, method, path},
    };

    use super::*;

    #[tokio::test]
    async fn given_mock_resend_when_post_json_then_sends_bearer_json_and_returns_status_body() {
        // Given
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/emails"))
            .and(bearer_token("re_test_key"))
            .and(body_json(json!({
                "from": "noreply@example.com",
                "to": ["user@example.com"],
                "subject": "Hello",
                "text": "Body"
            })))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"id":"msg_1"}"#))
            .mount(&server)
            .await;

        let client = ReqwestResendHttpClient::new().expect("client builds");
        let url = format!("{}/emails", server.uri());
        let body = json!({
            "from": "noreply@example.com",
            "to": ["user@example.com"],
            "subject": "Hello",
            "text": "Body"
        });

        // When
        let response = client
            .post_json(&url, "re_test_key", &body)
            .await
            .expect("post_json succeeds");

        // Then
        assert_eq!(response.status, 200);
        assert_eq!(response.body, r#"{"id":"msg_1"}"#);
    }

    #[tokio::test]
    async fn given_mock_error_status_when_post_json_then_returns_status_and_body() {
        // Given — adapter returns HTTP status; ResendEmailSender maps non-2xx.
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/emails"))
            .and(bearer_token("re_test_key"))
            .respond_with(ResponseTemplate::new(422).set_body_string(r#"{"error":"bad"}"#))
            .mount(&server)
            .await;

        let client = ReqwestResendHttpClient::new().expect("client builds");
        let url = format!("{}/emails", server.uri());

        // When
        let response = client
            .post_json(&url, "re_test_key", &json!({ "to": ["a@b.co"] }))
            .await
            .expect("transport succeeds");

        // Then
        assert_eq!(response.status, 422);
        assert_eq!(response.body, r#"{"error":"bad"}"#);
    }
}
