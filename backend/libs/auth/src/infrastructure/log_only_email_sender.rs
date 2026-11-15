use async_trait::async_trait;

use crate::domain::{
    email_message::EmailMessage,
    email_sender::{EmailSendError, EmailSender},
};

/// Test/local adapter: logs recipient and subject; no outbound HTTP.
pub struct LogOnlyEmailSender;

#[async_trait]
impl EmailSender for LogOnlyEmailSender {
    async fn send(&self, message: &EmailMessage) -> Result<(), EmailSendError> {
        let body_chars = message.body.chars().count();
        tracing::info!(
            to = %message.to,
            subject = %message.subject,
            body_chars,
            "LogOnlyEmailSender: email send (body redacted)"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use backend_utils::EmailAddress;
    use tracing_test::traced_test;

    use super::*;

    #[tokio::test]
    #[traced_test]
    async fn given_log_provider_when_sending_then_succeeds_and_logs_to_and_subject() {
        // Given
        let sender = LogOnlyEmailSender;
        let message = EmailMessage {
            to: EmailAddress::parse("user@example.com").expect("valid email"),
            subject: "Verify your account".to_string(),
            body: "secret-token-must-not-appear".to_string(),
        };

        // When
        sender.send(&message).await.expect("log send succeeds");

        // Then
        assert!(logs_contain("user@example.com"));
        assert!(logs_contain("Verify your account"));
        assert!(!logs_contain("secret-token-must-not-appear"));
    }
}
