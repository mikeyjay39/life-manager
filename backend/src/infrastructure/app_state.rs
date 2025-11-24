use std::sync::Arc;
use tokio::sync::Mutex;

use crate::{
    application::document_repository::DocumentRepository,
    domain::{document_summarizer::DocumentSummarizer, document_text_reader::DocumentTextReader},
};

#[derive(Clone, Debug)]
pub struct AppState<T: DocumentRepository, Reader: DocumentTextReader, Summary: DocumentSummarizer>
{
    pub document_repository: Arc<Mutex<T>>,
    pub reader: Reader,
    pub summarizer: Summary,
}
