use async_trait::async_trait;

use crate::infrastructure::auth::login_request::LoginRequest;

#[async_trait]
trait LoginService: Sync + Send {
    fn login(&self, login_req: LoginRequest) -> Result<String, String>;
}
