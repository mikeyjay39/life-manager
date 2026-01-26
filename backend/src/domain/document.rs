use std::sync::Arc;

use serde::Deserialize;
use serde::Serialize;

use crate::domain::document_summarizer::DocumentSummarizer;
use crate::domain::document_summarizer::DocumentSummaryResult;
use crate::domain::document_text_reader::DocumentTextReader;
use crate::domain::uploaded_document_input::UploadedDocumentInput;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Document {
    pub id: i32,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub user_id: String,
}

impl Document {
    // Creates a new document
    pub fn new(id: i32, title: &str, content: &str, user_id: &str) -> Self {
        Self {
            id,
            title: title.to_string(),
            content: String::from(content),
            tags: vec![],
            user_id: user_id.to_string(),
        }
    }

    /**
     * Creates a Document from file bytes by reading the text and summarizing it.
     */
    pub async fn from_file(
        uploaded_document_input: &UploadedDocumentInput,
        reader: Arc<dyn DocumentTextReader>,
        summarizer: Arc<dyn DocumentSummarizer>,
    ) -> Option<Document> {
        tracing::info!("Document::from_file");
        let text = match reader.read_image(uploaded_document_input).await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Error reading document text: {}", e);
                return None;
            }
        };

        tracing::info!("Document text read successfully, text: {}", text);

        let summary_result = match (summarizer.summarize(&text)).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Error summarizing document text: {}", e);
                return None;
            }
        };

        let DocumentSummaryResult { summary, title } = summary_result;
        let document = Document {
            id: 0,
            title,
            content: summary,
            tags: vec![],
        };
        Some(document)
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_creation() {
        let doc = Document::new(1, "Test Document", "This is a test content.");
        assert_eq!(doc.id, 1);
        assert_eq!(doc.title, "Test Document");
        assert_eq!(doc.content, "This is a test content.");
        assert!(doc.tags.is_empty());
    }

    #[test]
    fn test_document_print_details() {
        let doc = Document::new(2, "Another Document", "Content of another document.");
        doc.print_details();
    }
}
