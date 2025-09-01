pub trait DocumentRepository: Sync + Send {
    fn get_document(&self, id: i32) -> Option<Document>;
    fn save_document(&self, document: &Document) -> bool;
}
