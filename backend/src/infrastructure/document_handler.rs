use crate::domain::document::Document;
use crate::domain::uploaded_document_input::UploadedDocumentInput;
use axum::extract::{Multipart, Path, State};
use axum::response::IntoResponse;
use axum::{Json, http::StatusCode};
use serde::{Deserialize, Serialize};

use super::app_state::AppState;
use super::document_dto::DocumentDto;

#[derive(Deserialize, Serialize)]
pub struct CreateDocumentCommand {
    pub id: i32,
    pub title: String,
    pub content: String,
}

/**
 * Creates a new document by processing multipart form data.
 * +---------+     +-----------+     +--------+     +----------+
 * |         |     |           |     |        |     |          |
 * | Handler |---->| Tesseract |---->| Ollama |---->| Postgres |
 * |         |     |           |     |        |     |          |
 * +---------+     +-----------+     +--------+     +----------+
 *
 */
pub async fn create_document(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    tracing::info!("Received multipart form data");
    let mut json_data: Option<CreateDocumentCommand> = None;
    let mut file_data = Vec::new();
    let mut file_name = String::new();

    while let Some(field) = multipart.next_field().await.unwrap() {
        match field.name() {
            Some("json") => {
                let text = field.text().await.unwrap();
                json_data = serde_json::from_str(&text).ok();
            }
            Some("file") => {
                tracing::info!("Processing file field");
                if let Some(name) = field.file_name() {
                    file_name = name.to_string();
                }
                file_data = field.bytes().await.unwrap().to_vec();
                tracing::info!("Received file: {}", file_name);
            }
            _ => {}
        }
    }

    if let Some(_payload) = json_data {
        let document_opt = match !file_data.is_empty() {
            true => {
                let reader = state.document_use_cases.reader;
                let summarizer = state.document_use_cases.summarizer;
                let uploaded_document_input = UploadedDocumentInput::new(file_name, file_data);
                Document::from_file(&uploaded_document_input, reader, summarizer).await
            }
            false => Some(Document::new(
                _payload.id,
                &_payload.title,
                &_payload.content,
            )),
        };

        let document = match document_opt {
            Some(doc) => doc,
            None => {
                tracing::error!("Failed to create document from file data");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({})),
                );
            }
        };

        document.print_details();

        let mut repo = state.document_use_cases.document_repository.lock().await;
        let saved_doc_res = repo.save_document(document).await;
        match saved_doc_res {
            Err(e) => {
                tracing::error!("Error saving document: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({})),
                )
            }
            Ok(saved_doc) => {
                tracing::info!("Document saved: {:?}", saved_doc.title);
                (
                    StatusCode::CREATED,
                    Json(serde_json::json!(DocumentDto::from_document(&saved_doc))),
                )
            }
        }
    } else {
        tracing::warn!("No valid JSON data found in the multipart form");
        (StatusCode::NOT_FOUND, Json(serde_json::json!({})))
    }
}

pub async fn get_document(State(state): State<AppState>, Path(id): Path<u32>) -> impl IntoResponse {
    tracing::info!("Fetching document with ID: {}", id);
    let repo = state.document_use_cases.document_repository.lock().await;
    match repo.get_document(id as i32).await {
        Some(document) => (StatusCode::OK, Json(serde_json::json!(document.clone()))),
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({}))),
    }
}

/*
* TODO: Remove this. It is for testing only
* */
pub async fn upload(mut multipart: Multipart) {
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();
        let data = field.bytes().await.unwrap();

        tracing::info!("Length of `{}` is {} bytes", name, data.len());
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;
    use std::sync::Arc;

    use crate::application::document_repository::DocumentRepository;
    use crate::application::document_use_cases::DocumentUseCases;
    use crate::domain::document_summarizer::{DocumentSummarizer, DocumentSummaryResult};
    use crate::domain::document_text_reader::DocumentTextReader;
    use crate::infrastructure::document_collection::DocumentCollection;

    use super::*;
    use async_trait::async_trait;
    use axum::body::{Body, to_bytes};
    use axum::extract::FromRequest;
    use axum::http::{Request, StatusCode};
    use serde_json::from_slice;
    use tokio::sync::Mutex;

    struct MockDocumentTextReader;

    #[async_trait]
    impl DocumentTextReader for MockDocumentTextReader {
        async fn read_image(
            &self,
            _uploaded_document_input: &UploadedDocumentInput,
        ) -> Result<String, Box<dyn Error>> {
            Ok(String::from("This is test content."))
        }
    }

    struct MockDocumentSummarizer;
    #[async_trait]
    impl DocumentSummarizer for MockDocumentSummarizer {
        async fn summarize(&self, text: &str) -> Result<DocumentSummaryResult, Box<dyn Error>> {
            Ok(DocumentSummaryResult {
                summary: text.to_string(),
                title: String::from("Test Document"),
            })
        }
    }

    #[tokio::test]
    async fn test_create_document() {
        // Arrange
        let payload = CreateDocumentCommand {
            id: 1,
            title: String::from("Test Document"),
            content: String::from("This is test content."),
        };

        let state: AppState = AppState {
            document_use_cases: DocumentUseCases {
                document_repository: Arc::new(Mutex::new(DocumentCollection::new())),
                reader: Arc::new(MockDocumentTextReader {}),
                summarizer: Arc::new(MockDocumentSummarizer {}),
            },
        };

        // Serialize the JSON payload
        let json_string = serde_json::to_string(&payload).unwrap();

        // Create the multipart body
        let multipart_body = format!(
            "--boundary\r\n\
        Content-Disposition: form-data; name=\"json\"\r\n\
        Content-Type: application/json\r\n\r\n\
        {}\r\n\
        --boundary\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        This is test content.\r\n\
        --boundary--",
            json_string
        );

        // Create the request
        let request = Request::builder()
            .header("content-type", "multipart/form-data; boundary=boundary")
            .body(Body::from(multipart_body))
            .unwrap();

        let multipart = Multipart::from_request(request, &state).await.unwrap();
        let response = create_document(State(state), multipart)
            .await
            .into_response();

        let (parts, body) = response.into_parts();
        let status_code = parts.status;
        // Assert
        assert_eq!(status_code, StatusCode::CREATED);

        let bytes = to_bytes(body, usize::MAX)
            .await
            .expect("Failed to read body");

        // Deserialize the bytes into a DocumentDto object
        let response_document: DocumentDto =
            from_slice(&bytes).expect("Failed to deserialize body");
        assert_eq!(response_document.title, "Test Document");
        assert_eq!(response_document.content, "This is test content.");
    }

    #[tokio::test]
    async fn test_get_document() {
        // Arrange
        let document = Document::new(1, "Test Document", "This is test content.");
        let mut repo = DocumentCollection::new();
        repo.save_document(document)
            .await
            .expect("Failed to save document to seed test");

        let state: AppState = AppState {
            document_use_cases: DocumentUseCases {
                document_repository: Arc::new(Mutex::new(repo)),
                reader: Arc::new(MockDocumentTextReader {}),
                summarizer: Arc::new(MockDocumentSummarizer {}),
            },
        };

        // Act
        let response = get_document(State(state), Path(1)).await;

        let response = response.into_response();
        let status_code = response.status();
        let body = response.into_body();
        // Assert
        assert_eq!(status_code, StatusCode::OK);

        let bytes = to_bytes(body, usize::MAX)
            .await
            .expect("Failed to read body");
        let response_document =
            serde_json::from_slice::<Document>(&bytes).expect("Failed to deserialize JSON");

        assert_eq!(response_document.title, "Test Document");
        assert_eq!(response_document.content, "This is test content.");
    }

    #[tokio::test]
    async fn test_get_document_not_found() {
        // Arrange
        let document = Document::new(1, "Test Document", "This is a test content.");
        let mut repo = DocumentCollection::new();
        repo.save_document(document)
            .await
            .expect("Failed to save document to seed test");

        let state: AppState = AppState {
            document_use_cases: DocumentUseCases {
                document_repository: Arc::new(Mutex::new(repo)),
                reader: Arc::new(MockDocumentTextReader {}),
                summarizer: Arc::new(MockDocumentSummarizer {}),
            },
        };

        // Act
        let response = get_document(State(state), Path(2)).await;
        let response = response.into_response();
        let status_code = response.status();
        let body = response.into_body();
        let _bytes = to_bytes(body, usize::MAX)
            .await
            .expect("Failed to read body");

        // Assert
        assert_eq!(status_code, StatusCode::NOT_FOUND);
        // TODO: assert empty response body
    }
}
