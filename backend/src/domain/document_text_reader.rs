use std::error::Error;

use crate::domain::uploaded_document_input::{self, UploadedDocumentInput};

pub trait DocumentTextReader {
    fn read_image(
        &self,
        uploaded_document_input: &UploadedDocumentInput,
    ) -> impl Future<Output = Result<String, Box<dyn Error>>>;
}
