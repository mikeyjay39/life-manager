use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::AppState,
    document::document_handler::{create_document, get_document, get_documents_by_title},
};

pub fn document_router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_document))
        .route("/{id}", get(get_document))
        .route("/", get(get_documents_by_title))
}
