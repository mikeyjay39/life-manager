use std::error::Error;

use crate::application::document_repository::DocumentRepository;
use crate::schema::documents;
use crate::{
    domain::document::Document,
    infrastructure::document_entity::{self, DocumentEntity},
};
use deadpool_diesel::InteractError;
use deadpool_diesel::postgres::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};

#[derive(Clone)]
pub struct DocumentOrmCollection {
    pub pool: Pool,
}

impl DocumentOrmCollection {
    pub fn new(pool: Pool) -> Self {
        DocumentOrmCollection { pool }
    }
}

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
                Ok(entity) => Some(Document::new(entity.id, &entity.title, &entity.content)),
                Err(_) => None,
            },
            Err(e) => {
                tracing::error!("Error retrieving document: {}", e);
                None
            }
        }
    }

    async fn save_document(&mut self, document: Document) -> Result<Document, Box<dyn Error>> {
        let conn = self
            .pool
            .get()
            .await
            .expect("Failed to get DB connection from pool");
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
