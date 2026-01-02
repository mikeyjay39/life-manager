use std::sync::Arc;

use crate::{
    application::document_use_cases::DocumentUseCases,
    infrastructure::auth::auth_use_cases::AuthUseCases,
};

#[derive(Clone)]
pub struct AppState {
    pub document_use_cases: Arc<DocumentUseCases>,
    pub auth_use_cases: Arc<AuthUseCases>,
}
