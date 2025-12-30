use async_trait::async_trait;

use crate::domain::document::Document;

#[async_trait]
pub trait DocumentRepository: Sync + Send {
    async fn get_document(&self, id: i32) -> Option<Document>;
    async fn save_document(
        &mut self,
        document: Document,
    ) -> Result<Document, Box<dyn std::error::Error>>;
}
