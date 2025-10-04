mod common;

use common::setup::init_tests;
use std::net::TcpListener;

use diesel::RunQueryDsl;
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
async fn test_db_connection() {
    let (_container, _pool, conn) = init_tests().await;

    // Run a simple query to verify the connection
    conn.interact(|conn| {
        diesel::sql_query("SELECT 1 from documents")
            .execute(conn)
            .expect("Failed to execute query")
    })
    .await
    .expect("Failed to interact with DB");
}

#[tokio::test]
async fn get_document() {
    let (_container, pool, _conn) = init_tests().await;
    // Launch backend server in a separate task
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let app = family_manager::build_app(pool).await;
    let server = axum::Server::from_tcp(listener)
        .unwrap()
        .serve(app.into_make_service());
    spawn(server);

    // Seed 1 document into the database

    // Make REST API call to create a document
    let _new_doc = serde_json::json!({
        "title": "Test Document",
        "content": "This is a test document."
    });
    let url = format!("http://{}/foo", addr);
    let res = reqwest::Client::new()
        .get(url)
        // .post(url)
        // .json(&new_doc)
        .send()
        .await
        .expect("Failed to send request");
    assert!(res.status().is_success());
    // let created_doc: serde_json::Value = res.json().await.expect("Failed to parse response");
    // assert_eq!(created_doc["title"], "Test Document");
    // assert_eq!(created_doc["content"], "This is a test document.");

    // conn.interact(|conn| {
    //     let count: i64 = diesel::sql_query("SELECT COUNT(*) FROM documents")
    //         .get_result(conn)
    //         .expect("Failed to count documents");
    //     assert_eq!(count, 1);
    // })
    // .await
    // .expect("Failed to interact with DB");
}
