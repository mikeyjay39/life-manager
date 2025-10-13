mod common;

use axum_test::TestServer;
use common::setup::run_test;
use family_manager::infrastructure::{
    document_dto::DocumentDto, document_handler::CreateDocumentCommand,
};
use serial_test::serial;
use tokio::task::spawn;
use tracing_test::traced_test;

use crate::common::setup::{IntegrationTestContainer, run_test2};

#[tokio::test]
#[serial]
#[traced_test]
#[ignore]
async fn test_server_starts() {
    let server = spawn(async move {
        family_manager::start_server();
    });
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    // Shut down the server
    server.abort();
}

#[tokio::test]
#[serial]
#[traced_test]
#[ignore]
async fn create_and_get_document() {
    run_test(
        |_contaier: &IntegrationTestContainer, addr: std::net::SocketAddr| async move {
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

            let url = format!("http://{}/documents", &addr);
            let res = reqwest::Client::new()
                .post(&url)
                .body(multipart_body)
                .header("Content-Type", "multipart/form-data; boundary=boundary")
                .send()
                .await
                .expect("Failed to send request");
            tracing::info!("Response: {:?}", res);
            assert!(res.status().is_success());

            // Verify the document was created in the database

            let get_response = reqwest::Client::new()
                .get(format!("http://{}/documents/{}", &addr, &payload.id))
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
    run_test2(
        // |_container: &IntegrationTestContainer, addr: std::net::SocketAddr| async move {
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

            // let url = format!("http://{}/documents", &addr);
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
