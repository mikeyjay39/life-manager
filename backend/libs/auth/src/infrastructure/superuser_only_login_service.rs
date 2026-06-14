use std::env;

use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    domain::{
        login_request::LoginRequest,
        login_service::{LoginResult, LoginService},
    },
    infrastructure::auth_user_seeder::admin_user_uuid,
};

/**
* A login service that only allows a superuser to log in.
*
* WARNING: This is for demonstration and testing purposes only. Do not use in production!
*/
pub struct SuperuserOnlyLoginService {
    admin_username: String,
    admin_password: String,
    admin_user_id: Uuid,
    tenant: String,
}

impl SuperuserOnlyLoginService {
    pub fn new(admin_username: String, admin_password: String, tenant: String) -> Self {
        SuperuserOnlyLoginService {
            admin_username,
            admin_password,
            admin_user_id: admin_user_uuid(),
            tenant,
        }
    }

    pub fn from_env_with_tenant(tenant: String) -> Self {
        Self::new(
            env::var("ADMIN_USERNAME").expect("ADMIN_USERNAME must be set"),
            env::var("ADMIN_PASSWORD").expect("ADMIN_PASSWORD must be set"),
            tenant,
        )
    }
}

impl Default for SuperuserOnlyLoginService {
    fn default() -> Self {
        Self::from_env_with_tenant("default_tenant".to_string())
    }
}

#[async_trait]
impl LoginService for SuperuserOnlyLoginService {
    async fn login(&self, login_req: &LoginRequest) -> Result<LoginResult, String> {
        let LoginRequest { username, password } = login_req;

        if username == &self.admin_username && password == &self.admin_password {
            Ok(LoginResult {
                user_id: self.admin_user_id,
                tenant: self.tenant.clone(),
            })
        } else {
            Err("Invalid user credentials".to_string())
        }
    }
}

#[cfg(test)]
mod tests {

    use crate::{
        domain::login_request::LoginRequest,
        infrastructure::auth_user_seeder::admin_user_uuid,
    };

    use super::*;

    #[tokio::test]
    async fn test_superuser_login_success() {
        let service = SuperuserOnlyLoginService::new(
            "admin".to_string(),
            "password".to_string(),
            "test_tenant".to_string(),
        );
        let login_req = LoginRequest {
            username: "admin".to_string(),
            password: "password".to_string(),
        };
        let result = service
            .login(&login_req)
            .await
            .expect("Login should succeed");
        assert_eq!(result.user_id, admin_user_uuid());
        assert_eq!(result.tenant, "test_tenant");
    }
}
