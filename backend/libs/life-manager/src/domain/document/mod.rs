// The private module holds the aggregate root; `pub use` re-exports it at the folder path.
#[allow(clippy::module_inception)]
mod document;
pub mod document_storage_ref;
pub mod uploaded_document_input;

pub use document::*;
