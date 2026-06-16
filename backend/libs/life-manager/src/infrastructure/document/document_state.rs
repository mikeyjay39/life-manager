use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::document_use_cases::DocumentUseCases,
    infrastructure::app_state::LifeManagerState,
};

/**
 `DocumentState` is a wrapper around `DocumentUseCases` to be used as state in Axum handlers so we
 don't couple against the entire LifeManagerState.
*/
#[derive(Clone)]
pub struct DocumentState(pub Arc<DocumentUseCases>);

impl FromRef<LifeManagerState> for DocumentState {
    fn from_ref(state: &LifeManagerState) -> Self {
        DocumentState(state.document_use_cases.clone())
    }
}
