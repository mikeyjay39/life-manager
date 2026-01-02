use std::sync::Arc;

use crate::infrastructure::auth::login_service::LoginService;

#[derive(Clone)]
pub struct AuthUseCases {
    pub login_service: Arc<dyn LoginService>,
}
