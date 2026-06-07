use std::sync::Arc;

use crate::application::auth_use_cases::AuthUseCases;

#[derive(Clone)]
pub struct AuthState(pub Arc<AuthUseCases>);
