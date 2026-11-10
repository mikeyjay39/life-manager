#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use std::sync::{Arc, Mutex};

use crate::common::setup::{
    LoginRequest, run_test_with_test_profile, run_test_with_test_profile_and_db_setup,
};
use auth::test_support;
use axum_test::TestServer;
use reqwest::{ClientBuilder, Error, Response, StatusCode};
use serial_test::serial;
use tracing_test::traced_test;

const AUTH_URL: &str = "/life-manager/api/v1/auth";

#[derive(serde::Serialize)]
struct SignupRequest {
    email: String,
    password: String,
}

#[derive(serde::Serialize)]
struct VerifyEmailRequest {
    token: String,
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_valid_signup_when_creating_user_then_sends_verify_email_and_login_fails() {
    let pool_holder: Arc<Mutex<Option<Arc<deadpool_diesel::sqlite::Pool>>>> =
        Arc::new(Mutex::new(None));
    let pool_holder_clone = pool_holder.clone();
    let email = "new-user@example.com";
    let password = "password123";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            *pool_holder_clone.lock().unwrap() = Some(pool);
        },
        move |server: TestServer| async move {
            let signup_res = do_signup(&server, email, password)
                .await
                .expect("Failed to send signup request");
            assert_eq!(signup_res.status(), StatusCode::CREATED);
            let body: serde_json::Value = signup_res.json().await.expect("signup JSON");
            assert!(body["message"].as_str().unwrap().contains("Check your email"));

            let pool = pool_holder
                .lock()
                .unwrap()
                .clone()
                .expect("pool should be set");
            let user_id = test_support::get_user_id_by_username(&pool, email)
                .await
                .expect("lookup user")
                .expect("user should exist after signup");
            assert!(
                test_support::has_unused_signup_verify_token(&pool, user_id)
                    .await
                    .expect("token lookup"),
                "signup must issue an unused signup_verify token (EmailSender path)"
            );

            let login_res = do_login(&server, email, password)
                .await
                .expect("Failed to send login request");
            assert_eq!(login_res.status(), StatusCode::UNAUTHORIZED);
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_signup_when_verifying_email_then_login_succeeds() {
    let pool_holder: Arc<Mutex<Option<Arc<deadpool_diesel::sqlite::Pool>>>> =
        Arc::new(Mutex::new(None));
    let pool_holder_clone = pool_holder.clone();
    let email = "verify-user@example.com";
    let password = "password123";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            *pool_holder_clone.lock().unwrap() = Some(pool);
        },
        move |server: TestServer| async move {
            let signup_res = do_signup(&server, email, password)
                .await
                .expect("Failed to send signup request");
            assert_eq!(signup_res.status(), StatusCode::CREATED);

            let pool = pool_holder
                .lock()
                .unwrap()
                .clone()
                .expect("pool should be set");
            let user_id = test_support::get_user_id_by_username(&pool, email)
                .await
                .expect("lookup user")
                .expect("user should exist after signup");
            let token = test_support::issue_signup_verify_token(&pool, user_id, "life-manager")
                .await
                .expect("issue token");

            let verify_res = do_verify_email(&server, &token)
                .await
                .expect("Failed to send verify-email request");
            assert_eq!(verify_res.status(), StatusCode::OK);
            let verify_body: serde_json::Value = verify_res.json().await.expect("verify JSON");
            assert!(
                verify_body["message"]
                    .as_str()
                    .unwrap()
                    .contains("sign in")
            );
            assert!(verify_body.get("token").is_none());

            let reuse = do_verify_email(&server, &token)
                .await
                .expect("Failed to reuse verify-email request");
            assert_eq!(reuse.status(), StatusCode::BAD_REQUEST);

            let login_res = do_login(&server, email, password)
                .await
                .expect("Failed to send login request");
            assert!(login_res.status().is_success());
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_invalid_verify_token_when_verifying_then_returns_error() {
    run_test_with_test_profile(|server: TestServer| async move {
        let verify_res = do_verify_email(&server, "not-a-valid-token")
            .await
            .expect("Failed to send verify-email request");
        assert_eq!(verify_res.status(), StatusCode::BAD_REQUEST);
        let body: serde_json::Value = verify_res.json().await.expect("error JSON");
        assert_eq!(body["error"], "validation_error");
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_inactive_signup_when_activated_manually_then_login_succeeds() {
    let pool_holder: Arc<Mutex<Option<Arc<deadpool_diesel::sqlite::Pool>>>> =
        Arc::new(Mutex::new(None));
    let pool_holder_clone = pool_holder.clone();
    let email = "pending-user@example.com";
    let password = "password123";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            *pool_holder_clone.lock().unwrap() = Some(pool);
        },
        move |server: TestServer| async move {
            let signup_res = do_signup(&server, email, password)
                .await
                .expect("Failed to send signup request");
            assert_eq!(signup_res.status(), StatusCode::CREATED);

            let pool = pool_holder
                .lock()
                .unwrap()
                .clone()
                .expect("pool should be set");
            test_support::set_user_active(&pool, email, true)
                .await
                .expect("activate user");

            let login_res = do_login(&server, email, password)
                .await
                .expect("Failed to send login request");
            assert!(login_res.status().is_success());
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_duplicate_email_when_signing_up_then_returns_validation_error() {
    run_test_with_test_profile(|server: TestServer| async move {
        let email = "duplicate@example.com";
        let password = "password123";

        let first = do_signup(&server, email, password)
            .await
            .expect("Failed to send signup request");
        assert_eq!(first.status(), StatusCode::CREATED);

        let second = do_signup(&server, email, password)
            .await
            .expect("Failed to send signup request");
        assert_eq!(second.status(), StatusCode::BAD_REQUEST);
        let body: serde_json::Value = second.json().await.expect("error JSON");
        assert_eq!(body["error"], "validation_error");
    })
    .await;
}

async fn do_signup(server: &TestServer, email: &str, password: &str) -> Result<Response, Error> {
    let url_result = server
        .server_url(format!("{AUTH_URL}/signup").as_str())
        .expect("Failed to get server URL");
    let url = url_result.as_str();
    let req = SignupRequest {
        email: email.into(),
        password: password.into(),
    };
    let client = ClientBuilder::new()
        .build()
        .expect("Failed to build HTTP client");
    client.post(url).json(&req).send().await
}

async fn do_verify_email(server: &TestServer, token: &str) -> Result<Response, Error> {
    let url_result = server
        .server_url(format!("{AUTH_URL}/verify-email").as_str())
        .expect("Failed to get server URL");
    let url = url_result.as_str();
    let req = VerifyEmailRequest {
        token: token.into(),
    };
    let client = ClientBuilder::new()
        .build()
        .expect("Failed to build HTTP client");
    client.post(url).json(&req).send().await
}

async fn do_login(server: &TestServer, username: &str, password: &str) -> Result<Response, Error> {
    let url_result = server
        .server_url(format!("{AUTH_URL}/login").as_str())
        .expect("Failed to get server URL");
    let url = url_result.as_str();
    let req = LoginRequest {
        username: username.into(),
        password: password.into(),
    };
    let client = ClientBuilder::new()
        .build()
        .expect("Failed to build HTTP client");
    client.post(url).json(&req).send().await
}
