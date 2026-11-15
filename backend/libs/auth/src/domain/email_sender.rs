use std::fmt;

use async_trait::async_trait;

use super::email_message::EmailMessage;

/// Failure while sending mail through an [`EmailSender`] adapter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmailSendError {
    InvalidRecipient(String),
    InvalidSender(String),
    Provider(String),
}

impl fmt::Display for EmailSendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRecipient(detail) => write!(f, "Invalid email recipient: {detail}"),
            Self::InvalidSender(detail) => write!(f, "Invalid email sender: {detail}"),
            Self::Provider(detail) => write!(f, "Email provider error: {detail}"),
        }
    }
}

impl std::error::Error for EmailSendError {}

/// Port for outbound email. Domain stays free of HTTP crates.
#[async_trait]
pub trait EmailSender: Send + Sync {
    async fn send(&self, message: &EmailMessage) -> Result<(), EmailSendError>;
}
