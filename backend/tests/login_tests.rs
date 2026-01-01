mod common;

use crate::common::setup::run_test_with_test_profile;
use axum_test::TestServer;
use life_manager::infrastructure::auth::{LoginRequest, LoginResponse};
use reqwest::ClientBuilder;
use serial_test::serial;
use tracing_test::traced_test;

#[tokio::test]
#[serial]
#[traced_test]
async fn test_login_good_credentials() {
    run_test_with_test_profile(|server: TestServer| async move {
        let url_result = server
            .server_url("/login")
            .expect("Failed to get server URL");
        let url = url_result.as_str();
        tracing::info!("URL: {}", url);
        let req = LoginRequest {
            username: "admin".into(),
            password: "password".into(),
        };
        let client = ClientBuilder::new()
            .build()
            .expect("Failed to build HTTP client");
        let res = match client.post(url).json(&req).send().await {
            Ok(response) => response,
            Err(e) => panic!("Failed to send request: {}", e),
        };
        tracing::info!("Response: {:?}", res);
        assert!(
            res.status().is_success(),
            "Response status was not successful: {}",
            res.error_for_status().unwrap_err()
        );
        let login_response: LoginResponse = res.json().await.unwrap();
        assert_ne!(login_response.token.len(), 0);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn test_login_bad_credentials() {
    run_test_with_test_profile(|server: TestServer| async move {
        let url_result = server
            .server_url("/login")
            .expect("Failed to get server URL");
        let url = url_result.as_str();
        tracing::info!("URL: {}", url);
        let req = LoginRequest {
            username: "admin".into(),
            password: "badpassword".into(),
        };
        let client = ClientBuilder::new()
            .build()
            .expect("Failed to build HTTP client");
        let res = match client.post(url).json(&req).send().await {
            Ok(response) => response,
            Err(e) => panic!("Failed to send request: {}", e),
        };
        tracing::info!("Response: {:?}", res);
        assert!(
            res.status().is_client_error(),
            "Response status was not a 4xx: {}",
            res.error_for_status().unwrap_err()
        );
        let login_response: String = res.text().await.unwrap_or_else(|e| {
            panic!("Failed to read response text: {}", e);
        });
        // response should not contain a token
        assert_eq!(login_response.len(), 0);
    })
    .await;
}
