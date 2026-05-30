use std::sync::Arc;

use crate::auth_use_cases::AuthUseCases;

#[derive(Clone)]
pub struct AuthState(pub Arc<AuthUseCases>);
