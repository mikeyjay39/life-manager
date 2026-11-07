use std::sync::Arc;

use crate::application::{
    car_maintenance_event_repository::CarMaintenanceEventRepository,
    car_repository::CarRepository, document_repository::DocumentRepository,
};

#[derive(Clone)]
pub struct CarMaintenanceEventUseCases {
    pub car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    pub car_repository: Arc<dyn CarRepository>,
    /// Used only to verify owned Document UUID links.
    pub document_repository: Arc<dyn DocumentRepository>,
}
