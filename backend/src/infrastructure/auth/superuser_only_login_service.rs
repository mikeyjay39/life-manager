use std::env;

use async_trait::async_trait;

use crate::infrastructure::auth::{login_request::LoginRequest, login_service::LoginService};

/**
* A login service that only allows a superuser to log in.
*
* WARNING: This is for demonstration and testing purposes only. Do not use in production!
*/
pub struct SuperuserOnlyLoginService {
    admin_username: String,
    admin_password: String,
}

impl SuperuserOnlyLoginService {
    pub fn new(admin_username: String, admin_password: String) -> Self {
        SuperuserOnlyLoginService {
            admin_username,
            admin_password,
        }
    }
}

impl Default for SuperuserOnlyLoginService {
    fn default() -> Self {
        let admin_username = env::var("ADMIN_USERNAME").expect("ADMIN_USERNAME must be set");
        let admin_password = env::var("ADMIN_PASSWORD").expect("ADMIN_PASSWORD must be set");
        Self::new(admin_username, admin_password)
    }
}

#[async_trait]
impl LoginService for SuperuserOnlyLoginService {
    fn login(&self, login_req: &LoginRequest) -> Result<String, String> {
        let LoginRequest { username, password } = login_req;

        if username == &self.admin_username && password == &self.admin_password {
            Ok("superuser_token".to_string())
        } else {
            Err("Invalid user credentials".to_string())
        }
    }
}

#[cfg(test)]
mod tests {

    use tokio::test;

    use super::*;

    #[test]
    async fn test_superuser_login_success() {
        let service = SuperuserOnlyLoginService::new("admin".to_string(), "password".to_string());
        let login_req = LoginRequest {
            username: "admin".to_string(),
            password: "password".to_string(),
        };
        let result = service.login(&login_req);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "superuser_token".to_string());
    }
}
