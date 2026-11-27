use std::sync::Arc;

use crate::application::document::document_repository::DocumentRepository;

#[derive(Clone)]
pub struct DocumentUseCases {
    pub document_repository: Arc<dyn DocumentRepository>,
}
