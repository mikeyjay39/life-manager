use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::document::document_repository::DocumentRepository,
    domain::{document::Document, document::uploaded_document_input::UploadedDocumentInput},
};

pub struct UpdateDocumentCommand {
    document_id: Uuid,
    uploaded_document_input: UploadedDocumentInput,
    document_repository: Arc<dyn DocumentRepository>,
}

impl UpdateDocumentCommand {
    pub fn new(
        document_id: Uuid,
        uploaded_document_input: UploadedDocumentInput,
        document_repository: Arc<dyn DocumentRepository>,
    ) -> Self {
        Self {
            document_id,
            uploaded_document_input,
            document_repository,
        }
    }

    /// Applies the submitted metadata to the owned Document. Uploaded file bytes are ignored.
    pub async fn execute(self) -> AppResult<Document> {
        tracing::info!("Received update for document ID: {}", self.document_id);
        let Some(existing) = self
            .document_repository
            .load_owned_document(&self.document_id, &self.uploaded_document_input.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        let input = self.uploaded_document_input;
        let mut document = existing;
        document.apply_metadata_update(
            &input.title,
            input.content.as_deref().unwrap_or(""),
            input.tags,
            input.issued_date,
            input.expire_date,
        );
        if let Some(storage) = input.storage {
            document.storage = Some(storage);
        }
        document.print_details();

        match self.document_repository.update_document(document).await {
            Err(e) => {
                tracing::error!("Error updating document: {}", e);
                Err(AppError::from(e))
            }
            Ok(saved_doc) => {
                tracing::info!("Document updated: {:?}", saved_doc.title);
                Ok(saved_doc)
            }
        }
    }
}
