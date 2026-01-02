use async_trait::async_trait;

use crate::infrastructure::auth::{login_request::LoginRequest, login_service::LoginService};

/**
* A login service that only allows a superuser to log in.
*
* WARNING: This is for demonstration and testing purposes only. Do not use in production!
*/
pub struct SuperuserOnlyLoginService;

impl SuperuserOnlyLoginService {
    pub fn new() -> Self {
        SuperuserOnlyLoginService
    }
}

impl Default for SuperuserOnlyLoginService {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LoginService for SuperuserOnlyLoginService {
    fn login(&self, login_req: &LoginRequest) -> Result<String, String> {
        let LoginRequest { username, password } = login_req;

        if username == "admin" && password == "password" {
            Ok("superuser_token".to_string())
        } else {
            Err("Invalid user credentials".to_string())
        }
    }
}
