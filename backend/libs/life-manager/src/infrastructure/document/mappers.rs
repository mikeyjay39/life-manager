use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::car::document_link::{DocumentLink, ExistingDocument, NewDocument},
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

/// The JSON field names of one Document role, for error messages.
pub struct DocumentLinkFields {
    pub id: &'static str,
    pub new: &'static str,
}

/// Maps a role's `*_document_id` and embedded `new_*_document` to one link.
/// A request that sets both is a validation error.
pub fn document_link_from_dto(
    document_id: Option<Uuid>,
    new_document: Option<CreateDocumentCommandDto>,
    user_id: Uuid,
    fields: &DocumentLinkFields,
) -> AppResult<DocumentLink> {
    match (document_id, new_document) {
        (Some(_), Some(_)) => Err(both_set_error(fields)),
        (Some(id), None) => Ok(DocumentLink::Existing(ExistingDocument::new(id))),
        (None, Some(dto)) => new_document_link(dto, user_id),
        (None, None) => Ok(DocumentLink::None),
    }
}

fn new_document_link(dto: CreateDocumentCommandDto, user_id: Uuid) -> AppResult<DocumentLink> {
    let document = new_document_from_create_dto(dto, user_id)?;
    Ok(DocumentLink::New(NewDocument::new(document)))
}

fn both_set_error(fields: &DocumentLinkFields) -> AppError {
    AppError::Validation(format!(
        "set either {} or {}, not both",
        fields.id, fields.new
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const RECEIPT_FIELDS: DocumentLinkFields = DocumentLinkFields {
        id: "document_id",
        new: "new_receipt_document",
    };

    fn new_document_payload() -> CreateDocumentCommandDto {
        CreateDocumentCommandDto {
            title: "Receipt".to_string(),
            content: "summary".to_string(),
            tags: Vec::new(),
            issued_date: None,
            expire_date: None,
            storage: None,
        }
    }

    fn is_both_set_error(result: &AppResult<impl Sized>) -> bool {
        matches!(
            result,
            Err(AppError::Validation(message))
                if message == "set either document_id or new_receipt_document, not both"
        )
    }

    #[test]
    fn given_no_id_and_no_new_document_when_map_then_none() {
        let link = document_link_from_dto(None, None, Uuid::new_v4(), &RECEIPT_FIELDS);

        assert!(matches!(link, Ok(DocumentLink::None)));
    }

    #[test]
    fn given_id_when_map_then_existing_with_that_id() {
        let id = Uuid::new_v4();

        let link = document_link_from_dto(Some(id), None, Uuid::new_v4(), &RECEIPT_FIELDS);

        assert!(matches!(link, Ok(DocumentLink::Existing(existing)) if existing.id() == id));
    }

    #[test]
    fn given_new_document_when_map_then_new_owned_by_user() {
        let user_id = Uuid::new_v4();

        let link =
            document_link_from_dto(None, Some(new_document_payload()), user_id, &RECEIPT_FIELDS);

        let Ok(DocumentLink::New(new)) = link else {
            panic!("expected a new Document link");
        };
        assert_eq!(new.into_document().user_id, user_id);
    }

    #[test]
    fn given_id_and_new_document_when_map_then_validation() {
        let link = document_link_from_dto(
            Some(Uuid::new_v4()),
            Some(new_document_payload()),
            Uuid::new_v4(),
            &RECEIPT_FIELDS,
        );

        assert!(is_both_set_error(&link));
    }
}
