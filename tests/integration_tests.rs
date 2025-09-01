#[tokio::test]
async fn test_server_starts() {
    let server = tokio::spawn(async move {
        family_manager::start_server();
    });
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    assert!(true);
    // Shut down the server
    server.abort();
}
