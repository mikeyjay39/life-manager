use std::sync::Arc;

use crate::{
    application::document_repository::DocumentRepository,
    domain::{document::document_summarizer::DocumentSummarizer, document::document_text_reader::DocumentTextReader},
};

#[derive(Clone)]
pub struct DocumentUseCases {
    pub document_repository: Arc<dyn DocumentRepository>,
    pub reader: Arc<dyn DocumentTextReader>,
    pub summarizer: Arc<dyn DocumentSummarizer>,
}
