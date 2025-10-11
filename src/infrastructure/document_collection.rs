use crate::{application::document_repository::DocumentRepository, domain::document::Document};

#[derive(Clone)]
pub struct DocumentCollection {
    pub documents: Vec<Document>,
}

impl DocumentRepository for DocumentCollection {
    async fn get_document(&self, id: i32) -> Option<Document> {
        println!("Retrieving document with ID: {}", id);
        println!("Total documents in collection: {}", self.documents.len());
        match self.documents.iter().find(|doc| doc.id == id) {
            Some(doc) => Some(doc.clone()),
            None => None,
        }
    }

    async fn save_document(&mut self, document: &Document) -> bool {
        println!("Saving document with ID: {}", document.id);
        self.documents.push(document.clone());
        true
    }
}

impl DocumentCollection {
    pub fn new() -> Self {
        DocumentCollection {
            documents: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::document::Document;

    use super::*;

    #[tokio::test]
    pub async fn test_add_document() {
        let mut collection: DocumentCollection = DocumentCollection::new();
        assert_eq!(collection.documents.len(), 0);
        let doc = Document::new(1, "Test document", "This is a test content.");
        collection.save_document(&doc).await;
        assert_eq!(collection.documents.len(), 1);
    }

    #[tokio::test]
    pub async fn test_get_document() {
        let mut collection: DocumentCollection = DocumentCollection::new();
        let doc = Document::new(1, "Test document", "This is a test content.");
        collection.save_document(&doc).await;

        let retrieved_doc = collection.get_document(1).await.unwrap();
        assert_eq!(retrieved_doc.id, doc.id);
        assert_eq!(retrieved_doc.title, doc.title);
        assert_eq!(retrieved_doc.content, doc.content);
    }
}
