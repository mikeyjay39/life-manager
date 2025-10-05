mod common;

use common::setup::init_tests;
use family_manager::infrastructure::{
    document_dto::DocumentDto, document_handler::CreateDocumentCommand,
};
use tokio::task::spawn;

#[tokio::test]
async fn test_server_starts() {
    let server = spawn(async move {
        family_manager::start_server();
    });
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    // Shut down the server
    server.abort();
}

#[tokio::test]
async fn create_and_get_document() {
    let (_container, addr) = init_tests().await;

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
    println!("Response: {:?}", res);
    assert!(res.status().is_success());

    // Verify the document was created in the database

    let get_response = reqwest::Client::new()
        .get(format!("http://{}/documents/{}", &addr, &payload.id))
        .send()
        .await
        .expect("Failed to send request");
    println!("Get Response: {:?}", get_response);
    assert!(get_response.status().is_success());
    let document: DocumentDto = get_response.json().await.unwrap();
    assert_eq!(document.title, payload.title);
    assert_eq!(document.content, payload.content);
}
