use backend_utils::AppResult;
use uuid::Uuid;

use crate::{
    domain::document::{Document, uploaded_document_input::UploadedDocumentInput},
    infrastructure::document::document_api_types::CreateDocumentCommandDto,
};

pub fn from_create_to_uploaded_document_input(
    input: CreateDocumentCommandDto,
    user_id: Uuid,
    file_name: Option<String>,
    file_data: Vec<u8>,
) -> AppResult<UploadedDocumentInput> {
    Ok(UploadedDocumentInput::new(
        input.title,
        file_name,
        file_data,
        user_id,
        input.tags.clone(),
        Some(input.content.clone()),
        input.issued_date,
        input.expire_date,
        match input.storage {
            Some(storage) => Some(storage.into_domain()?),
            None => None,
        },
    ))
}

/// Builds a new owned Document from a JSON create payload (no file, no OCR).
/// `storage` may be `null`; when set it must be a valid Proton Drive ref.
pub fn new_document_from_create_dto(
    input: CreateDocumentCommandDto,
    user_id: Uuid,
) -> AppResult<Document> {
    Ok(Document::from_uploaded_input(
        from_create_to_uploaded_document_input(input, user_id, None, Vec::new())?,
    ))
}

/// Maps an optional embedded create payload to a new Document.
pub fn optional_new_document(
    input: Option<CreateDocumentCommandDto>,
    user_id: Uuid,
) -> AppResult<Option<Document>> {
    input
        .map(|dto| new_document_from_create_dto(dto, user_id))
        .transpose()
}
