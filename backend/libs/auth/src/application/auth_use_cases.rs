use std::sync::Arc;

use crate::domain::{
    login_service::LoginService, password_reset_service::PasswordResetService,
    signup_service::SignupService,
};

#[derive(Clone)]
pub struct AuthUseCases {
    pub login_service: Arc<dyn LoginService>,
    pub signup_service: Arc<dyn SignupService>,
    pub password_reset_service: Arc<dyn PasswordResetService>,
    pub tenant: String,
}

impl AuthUseCases {
    pub fn new(
        login_service: Arc<dyn LoginService>,
        signup_service: Arc<dyn SignupService>,
        password_reset_service: Arc<dyn PasswordResetService>,
        tenant: String,
    ) -> Self {
        AuthUseCases {
            login_service,
            signup_service,
            password_reset_service,
            tenant,
        }
    }
}
