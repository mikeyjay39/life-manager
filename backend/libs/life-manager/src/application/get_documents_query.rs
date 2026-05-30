use std::sync::Arc;

use uuid::Uuid;

use crate::{application::document_repository::DocumentRepository, domain::document::Document};

pub struct GetDocumentsQuery {
    doc_repo: Arc<dyn DocumentRepository>,
    user_id: Uuid,
    limit: u32,
}

impl GetDocumentsQuery {
    pub fn new(doc_repo: Arc<dyn DocumentRepository>, user_id: Uuid, limit: u32) -> Self {
        GetDocumentsQuery {
            doc_repo,
            user_id,
            limit,
        }
    }

    pub async fn execute(&self) -> Vec<Document> {
        self.doc_repo
            .get_documents(&self.user_id, &self.limit)
            .await
    }
}

pub struct GetDocumentsTitleCursorQuery {
    query: GetDocumentsQuery,
    title: String,
}

impl GetDocumentsTitleCursorQuery {
    pub fn new(
        doc_repo: Arc<dyn DocumentRepository>,
        user_id: Uuid,
        title: String,
        limit: u32,
    ) -> Self {
        GetDocumentsTitleCursorQuery {
            query: GetDocumentsQuery::new(doc_repo, user_id, limit),
            title,
        }
    }

    pub async fn execute(&self) -> Vec<Document> {
        self.query
            .doc_repo
            .get_documents_title_cursor(&self.query.user_id, &self.query.limit, &self.title)
            .await
    }
}
