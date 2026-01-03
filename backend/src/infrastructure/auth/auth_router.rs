use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::AppState,
    auth::{login_handler::login, test_protected_endpoint_handler::test_protected_endpoint},
};

pub fn auth_router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/protected", get(test_protected_endpoint))
}
