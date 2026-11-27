use axum::{
    Router,
    routing::{get, post, put},
};

use crate::infrastructure::{
    document::{
        document_extraction_handler::get_extraction_limits,
        document_handler::{
            create_document, create_document_json, delete_document, get_document,
            get_documents_by_title, update_document, update_document_json,
        },
    },
    shared::app_state::LifeManagerState,
};

pub fn document_router() -> Router<LifeManagerState> {
    Router::new()
        .route("/", post(create_document))
        .route("/json", post(create_document_json))
        .route("/json/{id}", put(update_document_json))
        .route("/extract/limits", get(get_extraction_limits))
        .route(
            "/{id}",
            get(get_document)
                .put(update_document)
                .delete(delete_document),
        )
        .route("/", get(get_documents_by_title))
}
