use std::sync::Arc;

use backend_utils::{AppError, AppResult};

use crate::{
    application::document::document_repository::DocumentRepository,
    domain::{document::Document, document::uploaded_document_input::UploadedDocumentInput},
};

pub struct CreateDocumentCommand {
    uploaded_document_input: UploadedDocumentInput,
    document_repository: Arc<dyn DocumentRepository>,
}

impl CreateDocumentCommand {
    pub fn new(
        uploaded_document_input: UploadedDocumentInput,
        document_repository: Arc<dyn DocumentRepository>,
    ) -> Self {
        Self {
            uploaded_document_input,
            document_repository,
        }
    }

    pub async fn execute(self) -> AppResult<Document> {
        let document = Document::from_uploaded_input(self.uploaded_document_input);
        document.print_details();

        match self.document_repository.save_document(document).await {
            Err(e) => {
                tracing::error!("Error saving document: {}", e);
                Err(AppError::from(e))
            }
            Ok(saved_doc) => {
                tracing::info!("Document saved: {:?}", saved_doc.title);
                Ok(saved_doc)
            }
        }
    }
}
