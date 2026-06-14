use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::{
    auth_password_hasher::AuthPasswordHasher,
    login_request::LoginRequest,
    login_service::{LoginResult, LoginService},
    principal::PrincipalRepository,
};

pub struct PrincipalLoginService {
    pub principal_repository: Arc<dyn PrincipalRepository>,
    pub password_hasher: Arc<dyn AuthPasswordHasher>,
}

#[async_trait]
impl LoginService for PrincipalLoginService {
    async fn login(&self, login_req: &LoginRequest) -> Result<LoginResult, String> {
        let principal = self
            .principal_repository
            .get_principal(&login_req.username)
            .await
            .ok_or_else(|| "User not found".to_string())?;

        if !(self
            .password_hasher
            .verify_password(&login_req.password, principal.password_hash()))
        {
            return Err("Password does not match".to_string());
        }

        Ok(LoginResult {
            user_id: principal.user_id().to_owned(),
            tenant: principal.tenant().to_owned(),
        })
    }
}
