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
use uuid::Uuid;

const AUTH_URL: &str = "/life-manager/api/v1/auth";

#[derive(serde::Serialize)]
struct PasswordResetRequestBody {
    email: String,
}

#[derive(serde::Serialize)]
struct PasswordResetConfirmBody {
    token: String,
    new_password: String,
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_active_user_when_requesting_reset_then_generic_success_and_token_issued() {
    let pool_holder: Arc<Mutex<Option<Arc<deadpool_diesel::sqlite::Pool>>>> =
        Arc::new(Mutex::new(None));
    let pool_holder_clone = pool_holder.clone();
    let user_id_holder: Arc<Mutex<Option<Uuid>>> = Arc::new(Mutex::new(None));
    let user_id_holder_clone = user_id_holder.clone();
    let email = "reset-active@example.com";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            unsafe {
                std::env::set_var("EMAIL_PROVIDER", "log");
                std::env::set_var(
                    "APP_PUBLIC_BASE_URL",
                    "https://life-manager.jeszenka.com",
                );
            }
            let user_id = test_support::insert_auth_user(
                &pool,
                email,
                "oldpassword",
                "life-manager",
                true,
            )
            .await
            .expect("insert user");
            *user_id_holder_clone.lock().unwrap() = Some(user_id);
            *pool_holder_clone.lock().unwrap() = Some(pool);
        },
        move |server: TestServer| async move {
            let res = do_request(&server, email).await.expect("request");
            assert_eq!(res.status(), StatusCode::OK);
            let body: serde_json::Value = res.json().await.expect("json");
            assert!(
                body["message"]
                    .as_str()
                    .unwrap()
                    .contains("password reset")
            );

            let pool = pool_holder
                .lock()
                .unwrap()
                .clone()
                .expect("pool should be set");
            let user_id = user_id_holder
                .lock()
                .unwrap()
                .expect("user id should be set");
            let token_count = test_support::count_unused_password_reset_tokens(&pool, user_id)
                .await
                .expect("count tokens");
            assert_eq!(
                token_count, 1,
                "active user request must issue a password_reset token (mail via log provider)"
            );
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_unknown_email_when_requesting_reset_then_same_success_and_no_token() {
    run_test_with_test_profile(|server: TestServer| async move {
        unsafe {
            std::env::set_var("EMAIL_PROVIDER", "log");
            std::env::set_var(
                "APP_PUBLIC_BASE_URL",
                "https://life-manager.jeszenka.com",
            );
        }
        let res = do_request(&server, "missing@example.com")
            .await
            .expect("request");
        assert_eq!(res.status(), StatusCode::OK);
        let body: serde_json::Value = res.json().await.expect("json");
        assert!(
            body["message"]
                .as_str()
                .unwrap()
                .contains("password reset")
        );
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_inactive_user_when_requesting_reset_then_no_token() {
    let pool_holder: Arc<Mutex<Option<Arc<deadpool_diesel::sqlite::Pool>>>> =
        Arc::new(Mutex::new(None));
    let pool_holder_clone = pool_holder.clone();
    let user_id_holder: Arc<Mutex<Option<Uuid>>> = Arc::new(Mutex::new(None));
    let user_id_holder_clone = user_id_holder.clone();
    let email = "inactive-reset@example.com";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            unsafe {
                std::env::set_var("EMAIL_PROVIDER", "log");
                std::env::set_var(
                    "APP_PUBLIC_BASE_URL",
                    "https://life-manager.jeszenka.com",
                );
            }
            let user_id = test_support::insert_auth_user(
                &pool,
                email,
                "oldpassword",
                "life-manager",
                false,
            )
            .await
            .expect("insert user");
            *user_id_holder_clone.lock().unwrap() = Some(user_id);
            *pool_holder_clone.lock().unwrap() = Some(pool);
        },
        move |server: TestServer| async move {
            let res = do_request(&server, email).await.expect("request");
            assert_eq!(res.status(), StatusCode::OK);

            let pool = pool_holder
                .lock()
                .unwrap()
                .clone()
                .expect("pool should be set");
            let user_id = user_id_holder
                .lock()
                .unwrap()
                .expect("user id should be set");
            let token_count = test_support::count_unused_password_reset_tokens(&pool, user_id)
                .await
                .expect("count tokens");
            assert_eq!(token_count, 0, "inactive user must not get a reset token");
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_valid_token_when_confirming_then_password_changes_and_token_not_reusable() {
    let token_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let token_holder_clone = token_holder.clone();
    let email = "confirm-reset@example.com";
    let old_password = "oldpassword";
    let new_password = "newpassword1";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            unsafe {
                std::env::set_var("EMAIL_PROVIDER", "log");
                std::env::set_var(
                    "APP_PUBLIC_BASE_URL",
                    "https://life-manager.jeszenka.com",
                );
            }
            let user_id = test_support::insert_auth_user(
                &pool,
                email,
                old_password,
                "life-manager",
                true,
            )
            .await
            .expect("insert user");
            let raw = test_support::issue_password_reset_token(&pool, user_id, "life-manager")
                .await
                .expect("issue token");
            *token_holder_clone.lock().unwrap() = Some(raw);
        },
        move |server: TestServer| async move {
            let token = token_holder
                .lock()
                .unwrap()
                .clone()
                .expect("token should be set");
            let confirm = do_confirm(&server, &token, new_password)
                .await
                .expect("confirm");
            assert_eq!(confirm.status(), StatusCode::OK);

            let old_login = do_login(&server, email, old_password)
                .await
                .expect("old login");
            assert_eq!(old_login.status(), StatusCode::UNAUTHORIZED);

            let new_login = do_login(&server, email, new_password)
                .await
                .expect("new login");
            assert!(new_login.status().is_success());

            let reuse = do_confirm(&server, &token, "anotherpass1")
                .await
                .expect("reuse");
            assert_eq!(reuse.status(), StatusCode::BAD_REQUEST);
        },
    )
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_bad_token_when_confirming_then_errors_and_hash_unchanged() {
    let pool_holder: Arc<Mutex<Option<Arc<deadpool_diesel::sqlite::Pool>>>> =
        Arc::new(Mutex::new(None));
    let pool_holder_clone = pool_holder.clone();
    let email = "bad-token@example.com";

    run_test_with_test_profile_and_db_setup(
        move |pool| async move {
            unsafe {
                std::env::set_var("EMAIL_PROVIDER", "log");
                std::env::set_var(
                    "APP_PUBLIC_BASE_URL",
                    "https://life-manager.jeszenka.com",
                );
            }
            test_support::insert_auth_user(&pool, email, "oldpassword", "life-manager", true)
                .await
                .expect("insert user");
            *pool_holder_clone.lock().unwrap() = Some(pool);
        },
        move |server: TestServer| async move {
            let pool = pool_holder
                .lock()
                .unwrap()
                .clone()
                .expect("pool should be set");
            let before = test_support::get_password_hash(&pool, email)
                .await
                .expect("hash before");

            let res = do_confirm(&server, "not-a-real-token", "newpassword1")
                .await
                .expect("confirm");
            assert_eq!(res.status(), StatusCode::BAD_REQUEST);

            let after = test_support::get_password_hash(&pool, email)
                .await
                .expect("hash after");
            assert_eq!(before, after);

            let login = do_login(&server, email, "oldpassword")
                .await
                .expect("login");
            assert!(login.status().is_success());
        },
    )
    .await;
}

async fn do_request(server: &TestServer, email: &str) -> Result<Response, Error> {
    let url = server
        .server_url(format!("{}/password-reset/request", AUTH_URL).as_str())
        .expect("url");
    let client = ClientBuilder::new().build().expect("client");
    client
        .post(url.as_str())
        .json(&PasswordResetRequestBody {
            email: email.to_string(),
        })
        .send()
        .await
}

async fn do_confirm(server: &TestServer, token: &str, new_password: &str) -> Result<Response, Error> {
    let url = server
        .server_url(format!("{}/password-reset/confirm", AUTH_URL).as_str())
        .expect("url");
    let client = ClientBuilder::new().build().expect("client");
    client
        .post(url.as_str())
        .json(&PasswordResetConfirmBody {
            token: token.to_string(),
            new_password: new_password.to_string(),
        })
        .send()
        .await
}

async fn do_login(server: &TestServer, username: &str, password: &str) -> Result<Response, Error> {
    let url = server
        .server_url(format!("{}/login", AUTH_URL).as_str())
        .expect("url");
    let client = ClientBuilder::new().build().expect("client");
    client
        .post(url.as_str())
        .json(&LoginRequest {
            username: username.into(),
            password: password.into(),
        })
        .send()
        .await
}
