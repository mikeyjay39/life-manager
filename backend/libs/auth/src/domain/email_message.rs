/// Outbound mail content for [`super::email_sender::EmailSender`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailMessage {
    pub to: String,
    pub subject: String,
    pub body: String,
}
