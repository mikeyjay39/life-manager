use std::sync::Arc;

use crate::application::{
    car_repository::CarRepository, document_repository::DocumentRepository,
};

#[derive(Clone)]
pub struct CarUseCases {
    pub car_repository: Arc<dyn CarRepository>,
    /// Used only to verify owned Document UUID links. Car stores refs only.
    pub document_repository: Arc<dyn DocumentRepository>,
}
