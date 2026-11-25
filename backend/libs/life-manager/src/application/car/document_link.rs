use uuid::Uuid;

use crate::domain::document::Document;

/// How a command links one Document role (insurance, registration, receipt).
///
/// Each linked state is its own type, so the compiler allows a state's methods
/// only after a `match` selects that state. A request that sets both an id and
/// a new Document for one role has no state here: the HTTP mapper rejects it.
pub enum DocumentLink {
    None,
    Existing(ExistingDocument),
    New(NewDocument),
}

impl DocumentLink {
    /// The Document id to store on the aggregate.
    pub fn linked_id(&self) -> Option<Uuid> {
        match self {
            DocumentLink::None => None,
            DocumentLink::Existing(existing) => Some(existing.id()),
            DocumentLink::New(new) => Some(new.id()),
        }
    }
}

/// A Document that the request links by id. The command must verify that the
/// user owns it.
pub struct ExistingDocument(Uuid);

impl ExistingDocument {
    pub fn new(id: Uuid) -> Self {
        Self(id)
    }

    pub fn id(&self) -> Uuid {
        self.0
    }
}

/// A Document to create in the same transaction as the aggregate write.
/// Boxed because a Document is much larger than the other link states.
pub struct NewDocument(Box<Document>);

impl NewDocument {
    pub fn new(document: Document) -> Self {
        Self(Box::new(document))
    }

    pub fn id(&self) -> Uuid {
        self.0.id
    }

    pub fn into_document(self) -> Document {
        *self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_none_when_linked_id_then_none() {
        assert_eq!(DocumentLink::None.linked_id(), None);
    }

    #[test]
    fn given_existing_when_linked_id_then_existing_id() {
        let id = Uuid::new_v4();

        let link = DocumentLink::Existing(ExistingDocument::new(id));

        assert_eq!(link.linked_id(), Some(id));
    }

    #[test]
    fn given_new_when_linked_id_then_new_document_id() {
        let document = Document::new("Receipt", "", Uuid::new_v4());
        let id = document.id;

        let link = DocumentLink::New(NewDocument::new(document));

        assert_eq!(link.linked_id(), Some(id));
    }

    #[test]
    fn given_new_document_when_into_document_then_same_document() {
        let document = Document::new("Receipt", "", Uuid::new_v4());
        let id = document.id;
        let new = NewDocument::new(document);

        assert_eq!(new.id(), id);
        assert_eq!(new.into_document().id, id);
    }
}
