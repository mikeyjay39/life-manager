use std::sync::Arc;

use crate::domain::{
    login_service::LoginService, password_reset_service::PasswordResetService,
    signup_service::SignupService, verify_email_service::VerifyEmailService,
};

#[derive(Clone)]
pub struct AuthUseCases {
    pub login_service: Arc<dyn LoginService>,
    pub signup_service: Arc<dyn SignupService>,
    pub verify_email_service: Arc<dyn VerifyEmailService>,
    pub password_reset_service: Arc<dyn PasswordResetService>,
    pub tenant: String,
}

impl AuthUseCases {
    pub fn new(
        login_service: Arc<dyn LoginService>,
        signup_service: Arc<dyn SignupService>,
        verify_email_service: Arc<dyn VerifyEmailService>,
        password_reset_service: Arc<dyn PasswordResetService>,
        tenant: String,
    ) -> Self {
        AuthUseCases {
            login_service,
            signup_service,
            verify_email_service,
            password_reset_service,
            tenant,
        }
    }
}
