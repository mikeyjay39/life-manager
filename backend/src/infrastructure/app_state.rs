use crate::application::document_use_cases::DocumentUseCases;

#[derive(Clone)]
pub struct AppState {
    pub document_use_cases: DocumentUseCases,
}
