use chrono::NaiveDateTime;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::domain::document::document_storage_ref::DocumentStorageRef;
use crate::domain::document::uploaded_document_input::UploadedDocumentInput;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Document {
    pub id: Uuid,
    pub title: String,
    pub content: String,
    tags: Vec<String>,
    pub user_id: Uuid,
    pub created_at: NaiveDateTime,
    pub issued_date: Option<NaiveDateTime>,
    pub expire_date: Option<NaiveDateTime>,
    pub storage: Option<DocumentStorageRef>,
}

/// Trims whitespace, lowercases, skips empty strings, and dedupes (first-seen order).
fn normalize_tag_names(tags: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let name = tag.trim().to_lowercase();
        if name.is_empty() || normalized.contains(&name) {
            continue;
        }
        normalized.push(name);
    }
    normalized
}
impl Document {
    /// Creates a new document with an auto-generated UUID
    pub fn new(title: &str, content: &str, user_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            title: title.to_string(),
            content: String::from(content),
            tags: vec![],
            user_id,
            created_at: Utc::now().naive_utc(),
            issued_date: None,
            expire_date: None,
            storage: None,
        }
    }

    /// Creates a document with a known ID (for loading from database)
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: Uuid,
        title: &str,
        content: &str,
        user_id: Uuid,
        tags: Vec<String>,
        created_at: NaiveDateTime,
        issued_date: Option<NaiveDateTime>,
        expire_date: Option<NaiveDateTime>,
        storage: Option<DocumentStorageRef>,
    ) -> Self {
        Self {
            id,
            title: title.to_string(),
            content: String::from(content),
            tags: normalize_tag_names(&tags),
            user_id,
            created_at,
            issued_date,
            expire_date,
            storage,
        }
    }

    /// Creates a document with metadata and optional external storage reference.
    pub fn from_uploaded_input(uploaded_document_input: UploadedDocumentInput) -> Self {
        let UploadedDocumentInput {
            title,
            content,
            user_id,
            tags,
            issued_date,
            expire_date,
            storage,
            ..
        } = uploaded_document_input;
        Self::with_id(
            Uuid::new_v4(),
            &title,
            content.as_deref().unwrap_or(""),
            user_id,
            tags,
            Utc::now().naive_utc(),
            issued_date,
            expire_date,
            storage,
        )
    }

    // Prints the document details
    pub fn print_details(&self) {
        tracing::info!("Document ID: {}", self.id);
        tracing::info!("Title: {}", self.title);
        tracing::info!("Content: {}", self.content);
    }

    pub fn content(&self) -> &String {
        &self.content
    }

    pub fn set_content(&mut self, content: String) {
        self.content = content;
    }

    /// Applies metadata fields from an update payload without changing identity or storage.
    pub fn apply_metadata_update(
        &mut self,
        title: &str,
        content: &str,
        tags: Vec<String>,
        issued_date: Option<NaiveDateTime>,
        expire_date: Option<NaiveDateTime>,
    ) {
        self.title = title.to_string();
        self.content = content.to_string();
        self.tags = normalize_tag_names(&tags);
        self.issued_date = issued_date;
        self.expire_date = expire_date;
    }

    pub fn get_tags(&self) -> &Vec<String> {
        &self.tags
    }

    pub fn set_tags(&mut self, tags: &[String]) {
        self.tags = normalize_tag_names(tags);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_creation() {
        let user_id = Uuid::new_v4();
        let doc = Document::new("Test Document", "This is a test content.", user_id);
        assert!(!doc.id.is_nil());
        assert_eq!(doc.title, "Test Document");
        assert_eq!(doc.content, "This is a test content.");
        assert!(doc.tags.is_empty());
    }

    #[test]
    fn test_document_with_id() {
        let doc_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let doc = Document::with_id(
            doc_id,
            "Test Document",
            "This is a test content.",
            user_id,
            vec![],
            Utc::now().naive_utc(),
            None,
            None,
            None,
        );
        assert_eq!(doc.id, doc_id);
        assert_eq!(doc.title, "Test Document");
        assert_eq!(doc.content, "This is a test content.");
        assert!(doc.tags.is_empty());
    }

    #[test]
    fn test_document_print_details() {
        let doc = Document::new(
            "Another Document",
            "Content of another document.",
            Uuid::new_v4(),
        );
        doc.print_details();
    }

    #[test]
    fn test_document_with_empty_strings() {
        let user_id = Uuid::new_v4();
        let doc = Document::new("", "", user_id);

        assert!(!doc.id.is_nil());
        assert_eq!(doc.title, "");
        assert_eq!(doc.content, "");
        assert_eq!(doc.user_id, user_id);
        assert!(doc.tags.is_empty());
    }

    #[test]
    fn test_document_with_very_long_strings() {
        let long_title = "A".repeat(10_000);
        let long_content = "B".repeat(1_000_000);
        let user_id = Uuid::new_v4();

        let doc = Document::new(&long_title, &long_content, user_id);

        assert_eq!(doc.title.len(), 10_000);
        assert_eq!(doc.content.len(), 1_000_000);
        assert!(!doc.id.is_nil());
    }

    #[test]
    fn test_document_with_unicode_and_special_chars() {
        let title = "文档标题 🚀 Тест";
        let content = "Content with émojis 😀 and special chars: <>&\"'\n\t\r";
        let user_id = Uuid::new_v4();

        let doc = Document::new(title, content, user_id);

        assert_eq!(doc.title, title);
        assert_eq!(doc.content, content);
    }

    #[test]
    fn test_document_with_newlines_and_whitespace() {
        let title = "  Title with spaces  ";
        let content = "\n\n  Content\n  with\n  newlines  \n\n";
        let user_id = Uuid::new_v4();

        let doc = Document::new(title, content, user_id);

        assert_eq!(doc.title, title);
        assert_eq!(doc.content, content);
    }

    #[test]
    fn test_content_getter() {
        let content = "Test content";
        let doc = Document::new("Title", content, Uuid::new_v4());

        assert_eq!(doc.content(), content);
        assert_eq!(doc.content(), &doc.content);
    }

    #[test]
    fn test_set_content() {
        let mut doc = Document::new("Title", "Original", Uuid::new_v4());

        doc.set_content("Updated content".to_string());
        assert_eq!(doc.content, "Updated content");

        doc.set_content(String::new());
        assert_eq!(doc.content, "");

        let long_content = "X".repeat(100_000);
        doc.set_content(long_content.clone());
        assert_eq!(doc.content, long_content);
    }

    #[test]
    fn test_document_clone() {
        let user_id = Uuid::new_v4();
        let doc = Document::new("Title", "Content", user_id);
        let cloned = doc.clone();

        assert_eq!(doc.id, cloned.id);
        assert_eq!(doc.title, cloned.title);
        assert_eq!(doc.content, cloned.content);
        assert_eq!(doc.user_id, cloned.user_id);
        assert_eq!(doc.tags, cloned.tags);
        assert_eq!(doc.created_at, cloned.created_at);
        assert_eq!(doc.issued_date, cloned.issued_date);
        assert_eq!(doc.expire_date, cloned.expire_date);
    }

    #[test]
    fn test_document_serialization() {
        let user_id = Uuid::new_v4();
        let doc = Document::new("Serialize Test", "Content here", user_id);

        let serialized = serde_json::to_string(&doc).expect("Failed to serialize");
        assert!(serialized.contains("Serialize Test"));
        assert!(serialized.contains("Content here"));

        let deserialized: Document =
            serde_json::from_str(&serialized).expect("Failed to deserialize");
        assert_eq!(deserialized.id, doc.id);
        assert_eq!(deserialized.title, doc.title);
        assert_eq!(deserialized.content, doc.content);
        assert_eq!(deserialized.user_id, doc.user_id);
        assert_eq!(deserialized.created_at, doc.created_at);
        assert_eq!(deserialized.issued_date, doc.issued_date);
        assert_eq!(deserialized.expire_date, doc.expire_date);
    }
}
