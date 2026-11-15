use async_trait::async_trait;

use crate::domain::password_reset_request::{
    PasswordResetConfirmRequest, PasswordResetConfirmResponse, PasswordResetRequestRequest,
    PasswordResetRequestResponse,
};

#[async_trait]
pub trait PasswordResetService: Sync + Send {
    async fn request_reset(
        &self,
        req: &PasswordResetRequestRequest,
    ) -> Result<PasswordResetRequestResponse, String>;

    async fn confirm_reset(
        &self,
        req: &PasswordResetConfirmRequest,
    ) -> Result<PasswordResetConfirmResponse, String>;
}
