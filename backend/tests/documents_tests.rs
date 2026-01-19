mod common;

use std::fs;

use axum_test::TestServer;
use life_manager::infrastructure::document::{
    document_dto::DocumentDto, document_handler::CreateDocumentCommand,
};
use reqwest::multipart::{Form, Part};
use serial_test::serial;
use tracing_test::traced_test;

use crate::common::setup::{
    build_auth_header, run_test_with_all_containers, run_test_with_test_profile,
};
use reqwest::ClientBuilder;
use std::time::Duration;

const DOCUMENTS_URL: &str = "/api/v1/documents";
const AUTH_URL: &str = "/api/v1/auth/login";

#[tokio::test]
#[serial]
#[traced_test]
#[ignore]
async fn create_and_get_document_docker_compose() {
    run_test_with_all_containers(|server: TestServer| async move {
        let auth_header = build_auth_header(&server);

        // Make REST API call to create a document
        let payload = CreateDocumentCommand {
            id: 2,
            title: String::from("Integration Test Document"),
            content: String::from("This is a test content."),
        };

        let json_string = serde_json::to_string(&payload).unwrap();
        let file_name = "tests/resources/hello_world.pdf";
        let file_bytes = fs::read(file_name)
            .unwrap_or_else(|_| panic!("Could not read bytes from file: {}", file_name));

        let form = Form::new()
            .part(
                "json",
                Part::text(json_string.to_string())
                    .mime_str("application/json")
                    .expect("Could not set mime type to json"),
            )
            .part(
                "file",
                Part::bytes(file_bytes)
                    .file_name("hello_world.pdf")
                    .mime_str("application/pdf")
                    .expect("Could not set mime type to pdf"),
            );

        let url_result = server
            .server_url(DOCUMENTS_URL)
            .expect("Failed to get server URL");
        let url = url_result.as_str();
        tracing::info!("URL: {}", url);

        let client = ClientBuilder::new()
            .timeout(Duration::from_secs(30)) // Total request timeout
            .build()
            .expect("Failed to build HTTP client");
        let res = match client
            .post(url)
            .multipart(form)
            .header("Authorization", &auth_header)
            .send()
            .await
        {
            Ok(response) => response,
            Err(e) => panic!("Failed to send request: {}", e),
        };
        tracing::info!("Response: {:?}", res);
        assert!(
            res.status().is_success(),
            "Response status was not successful: {}",
            res.error_for_status().unwrap_err()
        );
        let saved_document_resp: DocumentDto = res.json().await.unwrap();

        // Verify the document was created in the database
        let get_request_url_result = server
            .server_url(&format!("{}/{}", DOCUMENTS_URL, &saved_document_resp.id))
            .expect("Failed to get server URL");
        let get_request_url = get_request_url_result.as_str();
        tracing::info!("Get Request URL: {}", get_request_url);

        let get_response = reqwest::Client::new()
            .get(get_request_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("Failed to send request");
        tracing::info!("Get Response: {:?}", get_response);
        assert!(get_response.status().is_success());
        let document: DocumentDto = get_response.json().await.unwrap();
        assert_ne!(document.title.len(), 0); // TODO: Make this match our input title
        assert!(
            document.content.to_lowercase().contains("hello"),
            "{}",
            format!(
                "Document content does not contain expected text. Content: {}",
                document.content.as_str()
            )
        );
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn create_and_get_document() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        // Make REST API call to create a document
        let payload = CreateDocumentCommand {
            id: 2,
            title: String::from("Integration Test Document"),
            content: String::from("This is a test content."),
        };

        let json_string = serde_json::to_string(&payload).unwrap();
        let file_name = "tests/resources/hello_world.pdf";
        let file_bytes = fs::read(file_name)
            .unwrap_or_else(|_| panic!("Could not read bytes from file: {}", file_name));

        let form = Form::new()
            .part(
                "json",
                Part::text(json_string.to_string())
                    .mime_str("application/json")
                    .expect("Could not set mime type to json"),
            )
            .part(
                "file",
                Part::bytes(file_bytes)
                    .file_name("hello_world.pdf")
                    .mime_str("application/pdf")
                    .expect("Could not set mime type to pdf"),
            );

        let url_result = server
            .server_url(DOCUMENTS_URL)
            .expect("Failed to get server URL");
        let url = url_result.as_str();
        tracing::info!("URL: {}", url);

        let client = ClientBuilder::new()
            .build()
            .expect("Failed to build HTTP client");
        let res = match client
            .post(url)
            .multipart(form)
            .header("Authorization", &auth_header)
            .send()
            .await
        {
            Ok(response) => response,
            Err(e) => panic!("Failed to send request: {}", e),
        };
        tracing::info!("Response: {:?}", res);
        assert!(
            res.status().is_success(),
            "Response status was not successful: {}",
            res.error_for_status().unwrap_err()
        );
        let saved_document_resp: DocumentDto = res.json().await.unwrap();

        // Verify the document was created in the database
        let get_request_url_result = server
            .server_url(&format!("{}/{}", DOCUMENTS_URL, &saved_document_resp.id))
            .expect("Failed to get server URL");
        let get_request_url = get_request_url_result.as_str();
        tracing::info!("Get Request URL: {}", get_request_url);

        let get_response = reqwest::Client::new()
            .get(get_request_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("Failed to send request");
        tracing::info!("Get Response: {:?}", get_response);
        assert!(get_response.status().is_success());
        let document: DocumentDto = get_response.json().await.unwrap();
        assert_ne!(document.title.len(), 0); // TODO: Make this match our input title
        assert!(
            document.content.to_lowercase().contains("hello"),
            "{}",
            format!(
                "Document content does not contain expected text. Content: {}",
                document.content.as_str()
            )
        );
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn create_and_get_document_no_file() {
    run_test_with_test_profile(|server: TestServer| async move {
        // Login to get a token
        let auth_header = build_auth_header(&server).await;

        // Seed 1 document into the database
        let payload = CreateDocumentCommand {
            id: 2,
            title: String::from("Integration Test Document"),
            content: String::from("This is a test content."),
        };
        // Make REST API call to create a document
        let json_string = serde_json::to_string(&payload).unwrap();

        let multipart_body = format!(
            "--boundary\r\n\
        Content-Disposition: form-data; name=\"json\"\r\n\
        Content-Type: application/json\r\n\r\n\
        {}\r\n\
        --boundary--",
            json_string
        );

        let url_result = server
            .server_url(DOCUMENTS_URL)
            .expect("Failed to get server URL");
        let url = url_result.as_str();
        tracing::info!("URL: {}", url);
        let res = reqwest::Client::new()
            .post(url)
            .body(multipart_body)
            .header("Content-Type", "multipart/form-data; boundary=boundary")
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("Failed to send request");
        tracing::info!("Response: {:?}", res);
        assert!(res.status().is_success());

        let response_document = res.json::<DocumentDto>().await.unwrap();

        // Verify the document was created in the database

        let get_request_url_result = server
            .server_url(&format!("{}/{}", DOCUMENTS_URL, &response_document.id))
            .expect("Failed to get server URL");
        let get_request_url = get_request_url_result.as_str();
        tracing::info!("Get Request URL: {}", get_request_url);
        let get_response = reqwest::Client::new()
            .get(get_request_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("Failed to send request");
        tracing::info!("Get Response: {:?}", get_response);
        assert!(get_response.status().is_success());
        let document: DocumentDto = get_response.json().await.unwrap();
        assert_eq!(document.title, payload.title);
        assert_eq!(document.content, payload.content);
    })
    .await;
}
