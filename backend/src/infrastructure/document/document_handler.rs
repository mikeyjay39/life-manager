use crate::application::get_documents_query::{GetDocumentsQuery, GetDocumentsTitleCursorQuery};
use crate::domain::document::Document;
use crate::domain::uploaded_document_input::UploadedDocumentInput;
use crate::infrastructure::auth::auth_user::AuthUser;
use crate::infrastructure::document::document_state::DocumentState;
use axum::extract::{Multipart, Path, Query, State};
use axum::response::IntoResponse;
use axum::{Json, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::document_dto::DocumentDto;

const PAGE_LIMIT: u32 = 100;

#[derive(Deserialize, Serialize)]
pub struct CreateDocumentCommand {
    pub id: i32,
    pub title: String,
    pub content: String,
}

#[derive(Deserialize, Debug)]
pub struct GetDocumentsQueryParams {
    pub title: Option<String>,
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
    AuthUser { user_id }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    tracing::info!("Received multipart form data");
    let mut json_data: Option<CreateDocumentCommand> = None;
    let mut file_data = Vec::new();
    let mut file_name = String::new();

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
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
                let reader = document_use_cases.reader.clone();
                let summarizer = document_use_cases.summarizer.clone();
                let uploaded_document_input =
                    UploadedDocumentInput::new(file_name, file_data, user_id);
                Document::from_file(&uploaded_document_input, reader, summarizer).await
            }
            false => Some(Document::new(
                _payload.id,
                &_payload.title,
                &_payload.content,
                user_id,
            )),
        };

        let document = match document_opt {
            Some(doc) => doc,
            None => {
                tracing::error!("Failed to create document from file data");
                return return_500();
            }
        };

        document.print_details();

        let repo = document_use_cases.document_repository.clone();
        let saved_doc_res = repo.save_document(document).await;
        match saved_doc_res {
            Err(e) => {
                tracing::error!("Error saving document: {}", e);
                return_500()
            }
            Ok(saved_doc) => {
                tracing::info!("Document saved: {:?}", saved_doc.title);
                (
                    StatusCode::CREATED,
                    Json(json!(DocumentDto::from_document(&saved_doc))),
                )
            }
        }
    } else {
        tracing::warn!("No valid JSON data found in the multipart form");
        (StatusCode::NOT_FOUND, Json(json!({})))
    }
}

pub async fn get_document(
    AuthUser { user_id: _ }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
    Path(id): Path<u32>,
) -> impl IntoResponse {
    tracing::info!("Fetching document with ID: {}", id);
    let repo = document_use_cases.document_repository.clone();
    match repo.get_document(id as i32).await {
        Some(document) => (StatusCode::OK, Json(json!(document.clone()))),
        None => (StatusCode::NOT_FOUND, Json(json!({}))),
    }
}

/**
* NOTE: This is a testing function that doesn't guarantee order and is not suited for pagination.
*
*/
pub async fn get_documents(
    AuthUser { user_id }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
) -> impl IntoResponse {
    tracing::info!("Fetching documents for user: {}", user_id.to_string());
    let repo = document_use_cases.document_repository.clone();
    let query = GetDocumentsQuery::new(repo, user_id, PAGE_LIMIT);
    let documents = query.execute().await;
    (StatusCode::OK, Json(json!(documents)))
}

pub async fn get_documents_by_title(
    AuthUser { user_id }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
    Query(params): Query<GetDocumentsQueryParams>,
) -> impl IntoResponse {
    let title = params.title.unwrap_or_else(|| "".to_string());
    tracing::info!(
        "Fetching documents for user: {} with title cursor: {}",
        user_id.to_string(),
        title
    );
    let repo = document_use_cases.document_repository.clone();
    let query = GetDocumentsTitleCursorQuery::new(repo, user_id, title, PAGE_LIMIT);
    let documents = query.execute().await;
    (StatusCode::OK, Json(json!(documents)))
}

fn return_500() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({})))
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
    use crate::infrastructure::document::document_collection::DocumentCollection;

    use super::*;
    use async_trait::async_trait;
    use axum::body::{Body, to_bytes};
    use axum::extract::FromRequest;
    use axum::http::{Request, StatusCode};
    use serde::de::DeserializeOwned;
    use serde_json::from_slice;
    use uuid::Uuid;

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

    struct GivenUserAndDocuments {
        pub auth_user: AuthUser,
        pub document_use_cases: Arc<DocumentUseCases>,
    }

    struct ProcessedResponse<T> {
        pub status_code: StatusCode,
        pub response_payload: T,
    }

    #[tokio::test]
    async fn test_create_document() {
        // Arrange
        let payload = CreateDocumentCommand {
            id: 1,
            title: String::from("Test Document"),
            content: String::from("This is test content."),
        };

        let document_use_cases = Arc::new(DocumentUseCases {
            document_repository: Arc::new(DocumentCollection::new()),
            reader: Arc::new(MockDocumentTextReader {}),
            summarizer: Arc::new(MockDocumentSummarizer {}),
        });

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

        let multipart = Multipart::from_request(request, &()).await.unwrap();
        let auth_user = AuthUser {
            user_id: Uuid::new_v4(),
        };
        let response = create_document(
            auth_user,
            State(DocumentState(document_use_cases.clone())),
            multipart,
        )
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
        let GivenUserAndDocuments {
            auth_user,
            document_use_cases,
        } = given_user_and_documents().await;
        let response = get_document(
            auth_user,
            State(DocumentState(document_use_cases.clone())),
            Path(1),
        )
        .await;

        let ProcessedResponse {
            status_code,
            response_payload: response_document,
        } = process_response::<Document>(response).await;
        // Assert
        assert_eq!(status_code, StatusCode::OK);

        assert_eq!(response_document.title, "Test Document");
        assert_eq!(response_document.content, "This is test content.");
    }

    #[tokio::test]
    async fn test_get_document_not_found() {
        let GivenUserAndDocuments {
            auth_user,
            document_use_cases,
        } = given_user_and_documents().await;

        let response = get_document(
            auth_user,
            State(DocumentState(document_use_cases.clone())),
            Path(999999),
        )
        .await;
        let response = response.into_response();
        let status_code = response.status();

        // Assert
        assert_eq!(status_code, StatusCode::NOT_FOUND);
        // TODO: assert empty response body
    }

    #[tokio::test]
    async fn test_get_documents_by_title_empty() {
        let GivenUserAndDocuments {
            auth_user,
            document_use_cases,
        } = given_user_and_documents().await;

        let response = get_documents_by_title(
            auth_user,
            State(DocumentState(document_use_cases.clone())),
            Query(GetDocumentsQueryParams { title: None }),
        )
        .await;
        let ProcessedResponse {
            status_code,
            response_payload: response_documents,
        } = process_response::<Vec<Document>>(response).await;

        // Assert
        assert_eq!(status_code, StatusCode::OK);
        assert_eq!(response_documents.len(), 2); // NOTE: Check given_user_and_documents function for length
    }

    /**
     * This tests that documents are returned in order, and we should skip the ones with a name
     * before the one we search on.
     */
    #[tokio::test]
    async fn test_get_documents_by_title_named() {
        let GivenUserAndDocuments {
            auth_user,
            document_use_cases,
        } = given_user_and_documents().await;

        let response = get_documents_by_title(
            auth_user,
            State(DocumentState(document_use_cases.clone())),
            Query(GetDocumentsQueryParams {
                title: Some("Second Document".to_string()),
            }),
        )
        .await;
        let ProcessedResponse {
            status_code,
            response_payload: response_documents,
        } = process_response::<Vec<Document>>(response).await;

        // Assert
        assert_eq!(status_code, StatusCode::OK);
        assert_eq!(response_documents.len(), 1); // NOTE: Check given_user_and_documents function for length
    }

    /**
     * This tests that documents are returned in order, and we should not return any when we search
     * with the last one.
     * */
    #[tokio::test]
    async fn test_get_documents_by_title_last() {
        let GivenUserAndDocuments {
            auth_user,
            document_use_cases,
        } = given_user_and_documents().await;

        let response = get_documents_by_title(
            auth_user,
            State(DocumentState(document_use_cases.clone())),
            Query(GetDocumentsQueryParams {
                title: Some("Test Document".to_string()),
            }), // NOTE: Check given_user_and_documents function for
                // name of last document.
        )
        .await;
        let ProcessedResponse {
            status_code,
            response_payload: response_documents,
        } = process_response::<Vec<Document>>(response).await;

        // Assert
        assert_eq!(status_code, StatusCode::OK);
        assert_eq!(response_documents.len(), 0);
    }

    async fn given_user_and_documents() -> GivenUserAndDocuments {
        let auth_user = AuthUser {
            user_id: Uuid::new_v4(),
        };
        let document1 = Document::new(
            1,
            "Test Document",
            "This is test content.",
            auth_user.user_id,
        );
        let document2 = Document::new(
            2,
            "Second Document",
            "This is the second document",
            auth_user.user_id,
        );
        let repo = DocumentCollection::new();
        repo.save_document(document1)
            .await
            .expect("Failed to save document to seed test");
        repo.save_document(document2)
            .await
            .expect("Failed to save document to seed test");

        let document_use_cases = Arc::new(DocumentUseCases {
            document_repository: Arc::new(repo),
            reader: Arc::new(MockDocumentTextReader {}),
            summarizer: Arc::new(MockDocumentSummarizer {}),
        });

        return GivenUserAndDocuments {
            auth_user,
            document_use_cases,
        };
    }

    async fn process_response<T>(response: impl IntoResponse) -> ProcessedResponse<T>
    where
        T: DeserializeOwned,
    {
        let response = response.into_response();
        let status_code = response.status();
        let body = response.into_body();
        let bytes = to_bytes(body, usize::MAX)
            .await
            .expect("Failed to read body");

        let response_payload =
            serde_json::from_slice::<T>(&bytes).expect("Failed to deserialize JSON");

        ProcessedResponse {
            status_code,
            response_payload,
        }
    }
}
