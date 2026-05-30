use auth::auth_router;
use axum::Router;

use crate::document_router::document_router;
use crate::infrastructure::{app_state::AppState, document::document_router};

pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod schema;

/**
Hold the routers for domains and features.
*/
pub fn life_manager_api_router() -> Router<AppState> {
    Router::new().nest(
        "/api/v1",
        Router::new()
            .nest("/auth", auth_router::<AppState>())
            .nest("/documents", document_router()),
    )
}
