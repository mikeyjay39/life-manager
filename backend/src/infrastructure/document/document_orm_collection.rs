use std::error::Error;
use std::sync::Arc;

use crate::application::document_repository::DocumentRepository;
use crate::schema::documents;
use crate::{
    domain::document::Document,
    infrastructure::document::document_entity::{self, DocumentEntity},
};
use async_trait::async_trait;
use deadpool_diesel::InteractError;
use deadpool_diesel::postgres::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use uuid::Uuid;

#[derive(Clone)]
pub struct DocumentOrmCollection {
    pub pool: Arc<Pool>,
}

impl DocumentOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        DocumentOrmCollection { pool }
    }
}

#[async_trait]
impl DocumentRepository for DocumentOrmCollection {
    async fn get_document(&self, id: i32) -> Option<Document> {
        tracing::info!("Retrieving document with ID: {}", id);
        let conn = self
            .pool
            .get()
            .await
            .expect("Failed to get DB connection from pool");
        let result: Result<Result<DocumentEntity, diesel::result::Error>, InteractError> = conn
            .interact(move |conn| {
                documents::table
                    .filter(documents::id.eq(id))
                    .select(DocumentEntity::as_select())
                    .get_result(conn)
            })
            .await;

        match result {
            Ok(r) => match r {
                Ok(entity) => Some(Document::new(
                    entity.id,
                    &entity.title,
                    &entity.content,
                    entity.user_id,
                )),
                Err(_) => None,
            },
            Err(e) => {
                tracing::error!("Error retrieving document: {}", e);
                None
            }
        }
    }

    async fn get_documents(&self, user_id: &Uuid, limit: &u32) -> Vec<Document> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_documents: {}", e);
                let result: Vec<Document> = vec![];
                return result;
            }
        };

        let user_id = user_id.to_owned();
        let limit = limit.to_owned() as i64;

        let result: Result<Result<Vec<DocumentEntity>, diesel::result::Error>, InteractError> =
            conn.interact(move |conn| {
                documents::table
                    .filter(documents::user_id.eq(user_id))
                    .limit(limit)
                    .select(DocumentEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(r) => match r {
                Ok(entities) => entities
                    .into_iter()
                    .map(|e| Document::new(e.id, &e.title, &e.content, e.user_id))
                    .collect(),
                Err(_) => return vec![],
            },
            Err(e) => {
                tracing::error!("Error retrieving document: {}", e);
                let result: Vec<Document> = vec![];
                return result;
            }
        }
    }

    async fn get_documents_title_cursor(
        &self,
        user_id: &Uuid,
        limit: &u32,
        title: &str,
        doc_id: &i32,
    ) -> Vec<Document> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!(
                    "Could not get db connection for get_documents_title_cursor: {}",
                    e
                );
                let result: Vec<Document> = vec![];
                return result;
            }
        };

        let user_id = user_id.to_owned();
        let limit = limit.to_owned() as i64;
        let title = title.to_owned();
        let doc_id = doc_id.to_owned();

        let result: Result<Result<Vec<DocumentEntity>, diesel::result::Error>, InteractError> =
            conn.interact(move |conn| {
                documents::table
                    .filter(documents::user_id.eq(user_id))
                    .filter(documents::title.gt(title))
                    .filter(documents::id.gt(doc_id))
                    .order_by((documents::title.asc(), documents::id.asc()))
                    .limit(limit)
                    .select(DocumentEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(r) => match r {
                Ok(entities) => entities
                    .into_iter()
                    .map(|e| Document::new(e.id, &e.title, &e.content, e.user_id))
                    .collect(),
                Err(_) => return vec![],
            },
            Err(e) => {
                tracing::error!("Error retrieving document: {}", e);
                let result: Vec<Document> = vec![];
                return result;
            }
        }
    }

    async fn save_document(&self, document: Document) -> Result<Document, Box<dyn Error>> {
        let conn = self.pool.get().await?;
        let new_document = document_entity::NewDocumentEntity {
            title: document.title.clone(),
            content: document.content.clone(),
        };

        let result = conn
            .interact(|conn| {
                diesel::insert_into(documents::table)
                    .values(new_document)
                    .returning(DocumentEntity::as_returning())
                    .get_result::<DocumentEntity>(conn)
            })
            .await;

        match result {
            Ok(success) => match success {
                Ok(saved_doc) => {
                    tracing::info!("Document saved with ID: {}", saved_doc.id);
                    Ok(Document::new(
                        saved_doc.id,
                        &saved_doc.title,
                        &saved_doc.content,
                        saved_doc.user_id,
                    ))
                }
                Err(e) => {
                    tracing::error!("Error saving document: {}", e);
                    Err(Box::new(e))
                }
            },
            Err(e) => {
                tracing::error!("Error saving document: {}", e);
                Err(Box::new(e))
            }
        }
    }
}
