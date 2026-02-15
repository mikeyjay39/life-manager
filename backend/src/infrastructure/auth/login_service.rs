use async_trait::async_trait;
use uuid::Uuid;

use crate::infrastructure::auth::login_request::LoginRequest;

#[derive(Debug)]
pub struct LoginResult {
    pub user_id: Uuid,
}

#[async_trait]
pub trait LoginService: Sync + Send {
    fn login(&self, login_req: &LoginRequest) -> Result<LoginResult, String>;
}
