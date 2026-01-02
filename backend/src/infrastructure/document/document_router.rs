use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::AppState,
    document::document_handler::{create_document, get_document},
};

pub fn document_router() -> Router<AppState> {
    Router::new()
        .route("/documents", post(create_document))
        .route("/documents/{id}", get(get_document))
}
