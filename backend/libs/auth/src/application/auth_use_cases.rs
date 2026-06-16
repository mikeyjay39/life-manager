use std::sync::Arc;

use crate::domain::login_service::LoginService;

#[derive(Clone)]
pub struct AuthUseCases {
    pub login_service: Arc<dyn LoginService>,
    pub tenant: String,
}

impl AuthUseCases {
    pub fn new(login_service: Arc<dyn LoginService>, tenant: String) -> Self {
        AuthUseCases {
            login_service,
            tenant,
        }
    }
}
