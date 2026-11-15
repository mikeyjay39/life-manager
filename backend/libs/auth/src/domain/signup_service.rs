use async_trait::async_trait;

use crate::domain::signup_request::{SignupRequest, SignupResponse};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SignupError {
    Validation(String),
    /// User insert rolled back after verify-email send failed.
    EmailSendFailed(String),
}

#[async_trait]
pub trait SignupService: Sync + Send {
    async fn signup(&self, signup_req: &SignupRequest) -> Result<SignupResponse, SignupError>;
}
