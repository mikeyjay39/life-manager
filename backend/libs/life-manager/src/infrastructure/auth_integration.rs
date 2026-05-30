use auth::AuthState;
use axum::extract::FromRef;

use crate::infrastructure::app_state::AppState;

impl FromRef<AppState> for AuthState {
    fn from_ref(app_state: &AppState) -> Self {
        AuthState(app_state.auth_use_cases.clone())
    }
}
