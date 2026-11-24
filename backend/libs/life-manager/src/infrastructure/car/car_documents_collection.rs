use std::sync::Arc;

use async_trait::async_trait;

use crate::{
    application::{
        car::{car_documents_writer::CarDocumentsWriter, car_repository::CarRepository},
        document::document_repository::DocumentRepository,
    },
    domain::{car::Car, document::Document},
};

/// In-memory `CarDocumentsWriter` for unit tests. It writes the Documents only
/// after the Car write succeeds, so a failed Car write leaves no Document.
pub struct CarDocumentsCollection {
    car_repository: Arc<dyn CarRepository>,
    document_repository: Arc<dyn DocumentRepository>,
}

impl CarDocumentsCollection {
    pub fn new(
        car_repository: Arc<dyn CarRepository>,
        document_repository: Arc<dyn DocumentRepository>,
    ) -> Self {
        Self {
            car_repository,
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
impl CarDocumentsWriter for CarDocumentsCollection {
    async fn create(
        &self,
        car: Car,
        new_documents: Vec<Document>,
    ) -> Result<Car, Box<dyn std::error::Error>> {
        let saved = self.car_repository.save(car).await?;
        self.save_documents(new_documents).await?;
        Ok(saved)
    }

    async fn update(
        &self,
        car: Car,
        new_documents: Vec<Document>,
    ) -> Result<Car, Box<dyn std::error::Error>> {
        let saved = self.car_repository.update(car).await?;
        self.save_documents(new_documents).await?;
        Ok(saved)
    }
}
