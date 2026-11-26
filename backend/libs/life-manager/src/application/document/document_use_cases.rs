use std::sync::Arc;

use crate::application::document::document_repository::DocumentRepository;
use crate::domain::document::extraction_limits::ExtractionLimitsReader;
use crate::domain::document::extraction_usage::ExtractionUsage;

#[derive(Clone)]
pub struct DocumentUseCases {
    pub document_repository: Arc<dyn DocumentRepository>,
    pub extraction_limits_reader: Arc<dyn ExtractionLimitsReader>,
    pub extraction_usage: Arc<dyn ExtractionUsage>,
}
