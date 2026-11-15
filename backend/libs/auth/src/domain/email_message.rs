use backend_utils::EmailAddress;

/// Outbound mail content for [`super::email_sender::EmailSender`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailMessage {
    pub to: EmailAddress,
    pub subject: String,
    pub body: String,
}
