use async_trait::async_trait;
use tokio::sync::Mutex;

use crate::{application::document_repository::DocumentRepository, domain::document::Document};

pub struct DocumentCollection {
    pub documents: Mutex<Vec<Document>>,
}

#[async_trait]
impl DocumentRepository for DocumentCollection {
    async fn get_document(&self, id: i32) -> Option<Document> {
        tracing::info!("Retrieving document with ID: {}", id);
        let documents = self.documents.lock().await;
        tracing::info!("Total documents in collection: {}", documents.len());
        documents.iter().find(|doc| doc.id == id).cloned()
    }

    async fn save_document(
        &self,
        document: Document,
    ) -> Result<Document, Box<dyn std::error::Error>> {
        tracing::info!("Saving document with ID: {}", document.id);
        let mut documents = self.documents.lock().await;
        documents.push(document.clone());
        Ok(document)
    }
}

impl Default for DocumentCollection {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentCollection {
    pub fn new() -> Self {
        DocumentCollection {
            documents: Mutex::new(Vec::new()),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::document::Document;

    use super::*;

    #[tokio::test]
    pub async fn test_add_document() {
        let collection: DocumentCollection = DocumentCollection::new();
        {
            let documents = collection.documents.lock().await;
            assert_eq!(documents.len(), 0);
        }
        let doc = Document::new(1, "Test document", "This is a test content.");
        collection
            .save_document(doc)
            .await
            .expect("Failed to save document");
        {
            let documents = collection.documents.lock().await;
            assert_eq!(documents.len(), 1);
        }
    }

    #[tokio::test]
    pub async fn test_get_document() {
        let collection: DocumentCollection = DocumentCollection::new();
        let doc = Document::new(1, "Test document", "This is a test content.");
        collection
            .save_document(doc.clone())
            .await
            .expect("Failed to save document");

        let retrieved_doc = collection.get_document(1).await.unwrap();
        assert_eq!(retrieved_doc.id, doc.id);
        assert_eq!(retrieved_doc.title, doc.title);
        assert_eq!(retrieved_doc.content, doc.content);
    }
}
