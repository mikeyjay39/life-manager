use std::sync::Arc;

use tokio::sync::Mutex;

use crate::{
    application::document_repository::DocumentRepository,
    domain::{document_summarizer::DocumentSummarizer, document_text_reader::DocumentTextReader},
};

#[derive(Clone)]
pub struct DocumentUseCases {
    pub document_repository: Arc<Mutex<dyn DocumentRepository>>,
    pub reader: Arc<dyn DocumentTextReader>,
    pub summarizer: Arc<dyn DocumentSummarizer>,
}
