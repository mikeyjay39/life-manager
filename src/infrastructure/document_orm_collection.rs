use crate::schema::documents;
use crate::{
    application::application::DocumentRepository,
    domain::document::Document,
    infrastructure::document_entity::{self, DocumentEntity},
};
use deadpool_diesel::postgres::Pool;
use diesel::{ExpressionMethods, SelectableHelper};

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
        println!("Retrieving document with ID: {}", id);
        let conn = self
            .pool
            .get()
            .await
            .expect("Failed to get DB connection from pool");
        let result = conn
            .interact(move |conn| {
                documents::table
                    .filter(documents::id.eq(id))
                    .select(DocumentEntity::as_select())
                    .get_result(conn)
            })
            .await;

        return match result {
            Ok(Some(entity)) => Some(Document::new(entity.id, entity.title, entity.content)),
            Ok(None) => None,
            Err(e) => {
                eprintln!("Error retrieving document: {}", e);
                None
            }
        };
    }

    async fn save_document(&mut self, document: &Document) -> bool {
        let conn = self
            .pool
            .get()
            .await
            .expect("Failed to get DB connection from pool");
        let new_document = document_entity::NewDocumentEntity {
            title: &document.title,
            content: &document.content,
        };

        let result = conn
            .interact(|conn| {
                diesel::insert_into(documents::table)
                    .values(new_document)
                    .returning(DocumentEntity::as_returning())
                    .get_result::<DocumentEntity>(conn)
            })
            .await;

        return match result {
            Ok(_) => true,
            Err(e) => {
                eprintln!("Error saving document: {}", e);
                false
            }
        };
    }

    fn new(&mut pool: Pool) -> Self {
        DocumentOrmCollection { pool }
    }
}
