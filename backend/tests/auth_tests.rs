mod common;

use crate::common::setup::run_test_with_test_profile;
use axum_test::TestServer;
use life_manager::infrastructure::auth::login_request::{LoginRequest, LoginResponse};
use reqwest::{ClientBuilder, Error, Response};
use serial_test::serial;
use tracing_test::traced_test;

const AUTH_URL: &str = "/api/v1/auth";

#[tokio::test]
#[serial]
#[traced_test]
async fn login_and_jwt_auth_good_credentials() {
    run_test_with_test_profile(|server: TestServer| async move {
        let res = match do_login(&server, "admin", "password").await {
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

        // Test JWT validation
        let res = match call_protected_endpoint(&server, &login_response.token).await {
            Ok(response) => response,
            Err(e) => panic!("Failed to send request: {}", e),
        };
        tracing::info!("Protected Endpoint Response: {:?}", res);
        assert!(
            res.status().is_success(),
            "Response status was not successful: {}",
            res.error_for_status().unwrap_err()
        );
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn bad_credentials_fail_login() {
    run_test_with_test_profile(|server: TestServer| async move {
        let res = match do_login(&server, "admin", "badpassword").await {
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

#[tokio::test]
#[serial]
#[traced_test]
async fn protected_endpoint_bad_token_fails_auth() {
    run_test_with_test_profile(|server: TestServer| async move {
        let res = match call_protected_endpoint(&server, "badtoken").await {
            Ok(response) => response,
            Err(e) => panic!("Failed to send request: {}", e),
        };
        tracing::info!("Protected Endpoint Response: {:?}", res);
        assert!(
            res.status().is_client_error(),
            "Response status was not a 4xx: {}",
            res.error_for_status().unwrap_err()
        );
    })
    .await;
}

async fn do_login(server: &TestServer, username: &str, password: &str) -> Result<Response, Error> {
    let url_result = server
        .server_url(format!("{}/login", AUTH_URL).as_str())
        .expect("Failed to get server URL");
    let url = url_result.as_str();
    tracing::info!("URL: {}", url);
    let req = LoginRequest {
        username: username.into(),
        password: password.into(),
    };
    let client = ClientBuilder::new()
        .build()
        .expect("Failed to build HTTP client");
    client.post(url).json(&req).send().await
}

async fn call_protected_endpoint(server: &TestServer, token: &str) -> Result<Response, Error> {
    let url_result = server
        .server_url(format!("{}/protected", AUTH_URL).as_str())
        .expect("Failed to get server URL");
    let url = url_result.as_str();
    tracing::info!("URL: {}", url);
    let client = ClientBuilder::new()
        .build()
        .expect("Failed to build HTTP client");
    client.get(url).bearer_auth(token).send().await
}
