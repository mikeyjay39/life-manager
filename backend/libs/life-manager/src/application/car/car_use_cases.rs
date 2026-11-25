use std::sync::Arc;

use crate::application::{
    car::{car_documents_writer::CarDocumentsWriter, car_repository::CarRepository},
    document::document_repository::DocumentRepository,
};

#[derive(Clone)]
pub struct CarUseCases {
    pub car_repository: Arc<dyn CarRepository>,
    /// Used only to verify owned Document UUID links. Car stores refs only.
    pub document_repository: Arc<dyn DocumentRepository>,
    /// Writes a Car with new linked Documents in one transaction.
    pub car_documents_writer: Arc<dyn CarDocumentsWriter>,
}
