// The private module holds the aggregate root; `pub use` re-exports it at the folder path.
#[allow(clippy::module_inception)]
mod document;
pub mod document_extractor;
pub mod document_storage_ref;
pub mod extraction_limits;
pub mod extraction_media_type;
pub mod extraction_usage;
pub mod pdf_reader;
pub mod uploaded_document_input;

pub use document::*;
