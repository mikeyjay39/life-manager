use std::sync::Arc;

use axum::extract::FromRef;

use crate::infrastructure::{app_state::AppState, auth::auth_use_cases::AuthUseCases};

#[derive(Clone)]
pub struct AuthState(pub Arc<AuthUseCases>);

impl FromRef<AppState> for AuthState {
    fn from_ref(app_state: &AppState) -> Self {
        AuthState(app_state.auth_use_cases.clone())
    }
}
