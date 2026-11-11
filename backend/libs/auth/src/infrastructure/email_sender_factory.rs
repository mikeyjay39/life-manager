use std::sync::Arc;

use crate::domain::email_sender::EmailSender;

use super::{
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
///        +-- provider=log ----> LogOnlyEmailSender
///        |
///        +-- provider=resend -> ResendEmailSender
///                                   |
///                                   v
///                            Resend emails API
/// ```
pub fn build_email_sender(config: &EmailConfig) -> anyhow::Result<Arc<dyn EmailSender>> {
    match config.provider {
        EmailProvider::Log => Ok(Arc::new(LogOnlyEmailSender)),
        EmailProvider::Resend => {
            let api_key = config
                .resend_api_key
                .clone()
                .ok_or_else(|| anyhow::anyhow!("RESEND_API_KEY must be set when EMAIL_PROVIDER is resend"))?;
            let email_from = config
                .email_from
                .clone()
                .ok_or_else(|| anyhow::anyhow!("EMAIL_FROM must be set when EMAIL_PROVIDER is resend"))?;
            Ok(Arc::new(ResendEmailSender::new(
                api_key,
                email_from,
                Arc::new(ReqwestResendHttpClient::new()?),
            )))
        }
    }
}
