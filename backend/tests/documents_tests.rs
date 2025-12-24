mod common;

use std::{env::set_var, fs};

use axum_test::TestServer;
use common::setup::run_test;
use life_manager::infrastructure::{
    document_dto::DocumentDto, document_handler::CreateDocumentCommand,
};
use reqwest::multipart::{Form, Part};
use serial_test::serial;
use tracing_test::traced_test;

use crate::common::{
    docker::start_docker_compose,
    setup::{IntegrationTestContainer, build_app_server},
};

#[tokio::test]
async fn create_and_get_document_docker_compose() {
    start_docker_compose();
    // let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let database_url = "postgres://postgres:password@localhost:5432/mydb".to_string();
    unsafe {
        set_var("TESSERACT_URL", "http://localhost:8884"); // TODO: Make this read env file
    }

    let server = build_app_server(&database_url).await;
    // Seed 1 document into the database
    let payload = CreateDocumentCommand {
        id: 2,
        title: String::from("Integration Test Document"),
        content: String::from("This is a test content."),
    };

    // Make REST API call to create a document
    let json_string = serde_json::to_string(&payload).unwrap();

    // Read the file (PDF in your case)
    let file_name = "/home/mikeyjay/repos/add-ocr/backend/tests/resources/hello_world.pdf";
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
        .server_url("/documents")
        .expect("Failed to get server URL");
    let url = url_result.as_str();
    tracing::info!("URL: {}", url);
    let res = reqwest::Client::new()
        .post(url)
        .multipart(form)
        .send()
        .await
        .expect("Failed to send request");
    tracing::info!("Response: {:?}", res);
    assert!(res.status().is_success());
    let saved_document_resp: DocumentDto = res.json().await.unwrap();

    // Verify the document was created in the database
    let get_request_url_result = server
        .server_url(&format!("/documents/{}", &saved_document_resp.id))
        .expect("Failed to get server URL");
    let get_request_url = get_request_url_result.as_str();
    tracing::info!("Get Request URL: {}", get_request_url);

    let get_response = reqwest::Client::new()
        .get(get_request_url)
        .send()
        .await
        .expect("Failed to send request");
    tracing::info!("Get Response: {:?}", get_response);
    assert!(get_response.status().is_success());
    let document: DocumentDto = get_response.json().await.unwrap();
    assert_ne!(document.title.len(), 0); // TODO: Make this match our input title
    assert!(document.content.to_lowercase().contains("hello world"));
}

#[tokio::test]
#[serial]
#[traced_test]
async fn create_and_get_document() {
    run_test(
        |_contaier: &IntegrationTestContainer, server: TestServer| async move {
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
        --boundary\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        This is test content.\r\n\
        --boundary--",
                json_string
            );

            let url_result = server
                .server_url("/documents")
                .expect("Failed to get server URL");
            let url = url_result.as_str();
            tracing::info!("URL: {}", url);
            let res = reqwest::Client::new()
                .post(url)
                .body(multipart_body)
                .header("Content-Type", "multipart/form-data; boundary=boundary")
                .send()
                .await
                .expect("Failed to send request");
            tracing::info!("Response: {:?}", res);
            assert!(res.status().is_success());

            // Verify the document was created in the database
            let get_request_url_result = server
                .server_url(&format!("/documents/{}", &payload.id))
                .expect("Failed to get server URL");
            let get_request_url = get_request_url_result.as_str();
            tracing::info!("Get Request URL: {}", get_request_url);

            let get_response = reqwest::Client::new()
                .get(get_request_url)
                .send()
                .await
                .expect("Failed to send request");
            tracing::info!("Get Response: {:?}", get_response);
            assert!(get_response.status().is_success());
            let document: DocumentDto = get_response.json().await.unwrap();
            assert_eq!(document.title, payload.title);
            assert_eq!(document.content, payload.content);
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn create_and_get_document_no_file() {
    run_test(
        |_container: &IntegrationTestContainer, server: TestServer| async move {
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
                .server_url("/documents")
                .expect("Failed to get server URL");
            let url = url_result.as_str();
            tracing::info!("URL: {}", url);
            let res = reqwest::Client::new()
                .post(url)
                .body(multipart_body)
                .header("Content-Type", "multipart/form-data; boundary=boundary")
                .send()
                .await
                .expect("Failed to send request");
            tracing::info!("Response: {:?}", res);
            assert!(res.status().is_success());

            // Verify the document was created in the database

            let get_request_url_result = server
                .server_url(&format!("/documents/{}", &payload.id))
                .expect("Failed to get server URL");
            let get_request_url = get_request_url_result.as_str();
            tracing::info!("Get Request URL: {}", get_request_url);
            let get_response = reqwest::Client::new()
                .get(get_request_url)
                .send()
                .await
                .expect("Failed to send request");
            tracing::info!("Get Response: {:?}", get_response);
            assert!(get_response.status().is_success());
            let document: DocumentDto = get_response.json().await.unwrap();
            assert_eq!(document.title, payload.title);
            assert_eq!(document.content, payload.content);
        },
    )
    .await;
}
