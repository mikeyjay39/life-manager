pub mod application {
    use crate::domain::document::Document;
    pub trait DocumentRepository: Sync + Send {
        async fn get_document(&self, id: i32) -> Option<Document>;
        async fn save_document(&mut self, document: &Document) -> bool;
    }

    // pub trait DocumentRepository {
    //     async fn get_document(&self, id: i32) -> Option<Document>;
    //     async fn save_document(&mut self, document: &Document) -> bool;
    //     fn new() -> Self;
    // }
    pub struct GetDocumentQuery;
}
