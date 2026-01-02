use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::document_use_cases::DocumentUseCases, infrastructure::app_state::AppState,
};

/**
 `DocumentState` is a wrapper around DocumentUseCases to be used as state in Axum handlers so we
* don't couple against the entire AppState.
*/
#[derive(Clone)]
pub struct DocumentState(pub Arc<DocumentUseCases>);

impl FromRef<AppState> for DocumentState {
    fn from_ref(app_state: &AppState) -> Self {
        DocumentState(app_state.document_use_cases.clone())
    }
}
