use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{Value, json};
use zeroize::Zeroizing;

use crate::domain::{
    email_message::EmailMessage,
    email_sender::{EmailSendError, EmailSender},
};

use super::resend_http_client::ResendHttpClient;

const RESEND_EMAILS_URL: &str = "https://api.resend.com/emails";

/// Resend HTTPS adapter for outbound auth email.
pub struct ResendEmailSender {
    api_key: Zeroizing<String>,
    email_from: String,
    http_client: Arc<dyn ResendHttpClient>,
    api_url: String,
}

impl ResendEmailSender {
    pub fn new(
        api_key: Zeroizing<String>,
        email_from: String,
        http_client: Arc<dyn ResendHttpClient>,
    ) -> Self {
        Self {
            api_key,
            email_from,
            http_client,
            api_url: RESEND_EMAILS_URL.to_string(),
        }
    }

    #[cfg(test)]
    fn with_api_url(mut self, api_url: String) -> Self {
        self.api_url = api_url;
        self
    }

    fn build_request_body(from: &str, message: &EmailMessage) -> Value {
        json!({
            "from": from,
            "to": [message.to],
            "subject": message.subject,
            "text": message.body,
        })
    }
}

#[async_trait]
impl EmailSender for ResendEmailSender {
    async fn send(&self, message: &EmailMessage) -> Result<(), EmailSendError> {
        if message.to.trim().is_empty() {
            return Err(EmailSendError::InvalidRecipient(
                "to must not be empty".to_string(),
            ));
        }
        if self.email_from.trim().is_empty() {
            return Err(EmailSendError::InvalidSender(
                "EMAIL_FROM must not be empty".to_string(),
            ));
        }

        let body = Self::build_request_body(&self.email_from, message);
        let response = self
            .http_client
            .post_json(&self.api_url, self.api_key.as_str(), &body)
            .await
            .map_err(EmailSendError::Provider)?;

        if !(200..300).contains(&response.status) {
            return Err(EmailSendError::Provider(format!(
                "Resend emails API returned HTTP {}: {}",
                response.status, response.body
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::infrastructure::resend_http_client::ResendHttpResponse;

    struct CapturingHttpClient {
        last: Mutex<Option<(String, String, Value)>>,
    }

    #[async_trait]
    impl ResendHttpClient for CapturingHttpClient {
        async fn post_json(
            &self,
            url: &str,
            api_key: &str,
            body: &Value,
        ) -> Result<ResendHttpResponse, String> {
            *self.last.lock().expect("lock") =
                Some((url.to_string(), api_key.to_string(), body.clone()));
            Ok(ResendHttpResponse {
                status: 200,
                body: r#"{"id":"msg_1"}"#.to_string(),
            })
        }
    }

    #[tokio::test]
    async fn given_resend_config_when_sending_then_posts_from_to_subject_and_body() {
        // Given
        let http = Arc::new(CapturingHttpClient {
            last: Mutex::new(None),
        });
        let sender = ResendEmailSender::new(
            Zeroizing::new("re_test_key".to_string()),
            "Life Manager <noreply@example.com>".to_string(),
            http.clone(),
        )
        .with_api_url("https://api.resend.com/emails".to_string());
        let message = EmailMessage {
            to: "user@example.com".to_string(),
            subject: "Reset your password".to_string(),
            body: "Click the link to reset.".to_string(),
        };

        // When
        sender.send(&message).await.expect("send succeeds");

        // Then
        let (url, api_key, body) = http.last.lock().expect("lock").clone().expect("captured");
        assert_eq!(url, "https://api.resend.com/emails");
        assert_eq!(api_key, "re_test_key");
        assert_eq!(body["from"], "Life Manager <noreply@example.com>");
        assert_eq!(body["to"], json!(["user@example.com"]));
        assert_eq!(body["subject"], "Reset your password");
        assert_eq!(body["text"], "Click the link to reset.");
    }

    #[tokio::test]
    async fn given_empty_to_when_sending_then_rejects_before_http() {
        // Given
        let http = Arc::new(CapturingHttpClient {
            last: Mutex::new(None),
        });
        let sender = ResendEmailSender::new(
            Zeroizing::new("re_test_key".to_string()),
            "noreply@example.com".to_string(),
            http.clone(),
        );
        let message = EmailMessage {
            to: String::new(),
            subject: "x".to_string(),
            body: "y".to_string(),
        };

        // When
        let err = sender.send(&message).await.expect_err("empty to");

        // Then
        assert!(matches!(err, EmailSendError::InvalidRecipient(_)));
        assert!(http.last.lock().expect("lock").is_none());
    }
}
