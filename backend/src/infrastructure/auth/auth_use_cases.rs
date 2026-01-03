use std::sync::Arc;

use crate::infrastructure::auth::login_service::LoginService;

#[derive(Clone)]
pub struct AuthUseCases {
    pub login_service: Arc<dyn LoginService>,
}

impl AuthUseCases {
    pub fn new(login_service: Arc<dyn LoginService>) -> Self {
        AuthUseCases { login_service }
    }
}
