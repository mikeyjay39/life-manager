use std::sync::Arc;

use async_trait::async_trait;

use crate::{
    application::{
        car::{
            car_maintenance_event_documents_writer::CarMaintenanceEventDocumentsWriter,
            car_maintenance_event_repository::CarMaintenanceEventRepository,
        },
        document::document_repository::DocumentRepository,
    },
    domain::{car::car_maintenance_event::CarMaintenanceEvent, document::Document},
};

/// In-memory `CarMaintenanceEventDocumentsWriter` for unit tests. It writes the
/// Documents only after the event write succeeds, so a failed event write
/// leaves no Document.
pub struct CarMaintenanceEventDocumentsCollection {
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    document_repository: Arc<dyn DocumentRepository>,
}

impl CarMaintenanceEventDocumentsCollection {
    pub fn new(
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
        document_repository: Arc<dyn DocumentRepository>,
    ) -> Self {
        Self {
            car_maintenance_event_repository,
            document_repository,
        }
    }

    async fn save_documents(
        &self,
        new_documents: Vec<Document>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        for document in new_documents {
            self.document_repository.save_document(document).await?;
        }
        Ok(())
    }
}

#[async_trait]
impl CarMaintenanceEventDocumentsWriter for CarMaintenanceEventDocumentsCollection {
    async fn create(
        &self,
        event: CarMaintenanceEvent,
        new_documents: Vec<Document>,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        let saved = self.car_maintenance_event_repository.save(event).await?;
        self.save_documents(new_documents).await?;
        Ok(saved)
    }

    async fn update(
        &self,
        event: CarMaintenanceEvent,
        new_documents: Vec<Document>,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        let saved = self.car_maintenance_event_repository.update(event).await?;
        self.save_documents(new_documents).await?;
        Ok(saved)
    }
}
