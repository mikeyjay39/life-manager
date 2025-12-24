use crate::domain::document::Document;

pub trait DocumentRepository: Sync + Send {
    fn get_document(&self, id: i32) -> impl Future<Output = Option<Document>>;
    fn save_document(
        &mut self,
        document: Document,
    ) -> impl Future<Output = Result<Document, Box<dyn std::error::Error>>>;
}
