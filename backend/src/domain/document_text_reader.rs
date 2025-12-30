use std::error::Error;

use async_trait::async_trait;

use crate::domain::uploaded_document_input::UploadedDocumentInput;

/**
 * Port for reading text from documents.
 */
#[async_trait]
pub trait DocumentTextReader: Sync + Send {
    async fn read_image(
        &self,
        uploaded_document_input: &UploadedDocumentInput,
    ) -> Result<String, Box<dyn Error>>;
}
