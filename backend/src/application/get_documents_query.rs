use std::sync::Arc;

use uuid::Uuid;

use crate::{application::document_repository::DocumentRepository, domain::document::Document};

pub struct GetDocumentsQuery {
    doc_repo: Arc<dyn DocumentRepository>,
    user_id: Uuid,
}

impl GetDocumentsQuery {
    pub fn new(doc_repo: Arc<dyn DocumentRepository>, user_id: Uuid) -> Self {
        GetDocumentsQuery { doc_repo, user_id }
    }

    pub async fn execute(&self, limit: &u32) -> Vec<Document> {
        self.doc_repo.get_documents(&self.user_id, limit).await
    }
}

// pub struct GetDocumentsTitleCursorQuery {
//     query: GetDocumentsQuery,
//     title: String,
// }
//
// impl GetDocumentsTitleCursorQuery {
//     pub fn new(doc_repo: Arc<dyn DocumentRepository>, user_id: Uuid, title: String) -> Self {
//         GetDocumentsTitleCursorQuery {
//             query: GetDocumentsQuery::new(doc_repo, user_id),
//             title,
//         }
//     }
// }
