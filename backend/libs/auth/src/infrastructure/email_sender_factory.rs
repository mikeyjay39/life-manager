use std::sync::Arc;

use crate::domain::email_sender::EmailSender;

use super::{
    capture_file_email_sender::CaptureFileEmailSender,
    email_config::{EmailConfig, EmailProvider},
    log_only_email_sender::LogOnlyEmailSender,
    resend_email_sender::ResendEmailSender,
    resend_http_client::ReqwestResendHttpClient,
};

/// Builds the configured [`EmailSender`] for auth composition.
///
/// ```text
/// AuthStateBuilder
///        |
///        v
/// EmailConfig::from_env
///        |
///        +-- provider=log ----> LogOnlyEmailSender (body redacted in logs)
///        |
///        +-- provider=capture -> CaptureFileEmailSender (full body on disk)
///        |                         |
///        |                         v
///        |                    EMAIL_CAPTURE_DIR/*.eml
///        |
///        +-- provider=resend -> ResendEmailSender
///                                   |
///                                   v
///                            Resend emails API
/// ```
pub fn build_email_sender(config: &EmailConfig) -> anyhow::Result<Arc<dyn EmailSender>> {
    match &config.provider {
        EmailProvider::Log => Ok(Arc::new(LogOnlyEmailSender)),
        EmailProvider::Capture { capture_dir } => {
            Ok(Arc::new(CaptureFileEmailSender::new(capture_dir.clone())))
        }
        EmailProvider::Resend {
            api_key,
            email_from,
        } => Ok(Arc::new(ResendEmailSender::new(
            api_key.clone(),
            email_from.clone(),
            Arc::new(ReqwestResendHttpClient::new()?),
        ))),
    }
}
