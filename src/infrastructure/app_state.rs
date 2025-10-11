use std::sync::Arc;
use tokio::sync::Mutex;

use crate::application::document_repository::DocumentRepository;

#[derive(Clone, Debug)]
pub struct AppState<T: DocumentRepository> {
    pub document_repository: Arc<Mutex<T>>,
}
