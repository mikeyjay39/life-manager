use auth::AuthState;
use axum::extract::FromRef;

use crate::infrastructure::app_state::LifeManagerState;

impl FromRef<LifeManagerState> for AuthState {
    fn from_ref(state: &LifeManagerState) -> Self {
        state.auth_state.clone()
    }
}
