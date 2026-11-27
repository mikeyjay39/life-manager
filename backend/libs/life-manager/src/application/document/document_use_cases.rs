use std::sync::Arc;

use crate::application::document::document_repository::DocumentRepository;
use crate::application::document::extraction_limits::ExtractionLimitsReader;
use crate::application::document::extraction_usage::ExtractionUsage;
use crate::domain::document::document_extractor::DocumentExtractor;
use crate::domain::document::pdf_reader::PdfReader;

#[derive(Clone)]
pub struct DocumentUseCases {
    pub document_repository: Arc<dyn DocumentRepository>,
    pub extraction_limits_reader: Arc<dyn ExtractionLimitsReader>,
    pub extraction_usage: Arc<dyn ExtractionUsage>,
    /// `None` when no provider is configured. The extract endpoint then returns 503.
    pub document_extractor: Option<Arc<dyn DocumentExtractor>>,
    pub pdf_reader: Arc<dyn PdfReader>,
}
