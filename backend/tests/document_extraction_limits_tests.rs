#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use std::sync::{Arc, OnceLock};

use axum_test::TestServer;
use deadpool_diesel::sqlite::Pool;
use diesel::RunQueryDsl;
use life_manager::infrastructure::document::document_extraction_api_types::ExtractionLimitsDto;
use reqwest::StatusCode;
use serial_test::serial;
use tracing_test::traced_test;

use crate::common::captured_logs::CapturedLogs;
use crate::common::setup::{
    build_auth_header, run_test_with_test_profile, run_test_with_test_profile_and_db_setup,
};

const LIMITS_URL: &str = "/life-manager/api/v1/documents/extract/limits";

async fn get_limits(server: &TestServer, auth_header: Option<&str>) -> reqwest::Response {
    let url = server
        .server_url(LIMITS_URL)
        .expect("limits url")
        .to_string();
    let request = reqwest::Client::new().get(url);
    let request = match auth_header {
        Some(header) => request.header("Authorization", header),
        None => request,
    };
    request.send().await.expect("get limits")
}

async fn get_limits_dto(server: &TestServer, auth_header: &str) -> ExtractionLimitsDto {
    let response = get_limits(server, Some(auth_header)).await;
    assert_eq!(response.status(), StatusCode::OK);
    response.json().await.expect("limits json")
}

async fn execute_sql(pool: &Pool, sql: &'static str) {
    let conn = pool.get().await.expect("pool connection");
    conn.interact(move |conn| diesel::sql_query(sql).execute(conn))
        .await
        .expect("interact")
        .expect("execute sql");
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_fresh_database_when_get_limits_then_200_with_seeded_values() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;

        let limits = get_limits_dto(&server, &auth_header).await;

        assert_eq!(
            limits,
            ExtractionLimitsDto {
                daily_limit_per_user: 20,
                remaining_today: 20,
                max_file_bytes: 10_485_760,
                max_pdf_pages: 5,
            }
        );
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_running_server_when_limits_row_updated_then_next_get_returns_new_limit() {
    let pool_slot: Arc<OnceLock<Arc<Pool>>> = Arc::new(OnceLock::new());
    let setup_slot = pool_slot.clone();
    run_test_with_test_profile_and_db_setup(
        |pool| async move {
            assert!(setup_slot.set(pool).is_ok(), "db setup runs once");
        },
        |server: TestServer| async move {
            let auth_header = build_auth_header(&server).await;
            let pool = pool_slot.get().expect("pool from db setup");
            assert_eq!(
                get_limits_dto(&server, &auth_header)
                    .await
                    .daily_limit_per_user,
                20
            );

            execute_sql(
                pool,
                "UPDATE document_extraction_limits SET daily_limit_per_user = 3, \
                 updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            )
            .await;

            let limits = get_limits_dto(&server, &auth_header).await;
            assert_eq!(limits.daily_limit_per_user, 3);
            assert_eq!(limits.remaining_today, 3);
        },
    )
    .await;
}

#[tokio::test]
#[serial]
async fn given_limits_row_deleted_when_get_limits_then_503_not_configured() {
    let logs = CapturedLogs::default();
    let _subscriber_guard = logs.capture(tracing::Level::ERROR);

    run_test_with_test_profile_and_db_setup(
        |pool| async move {
            execute_sql(&pool, "DELETE FROM document_extraction_limits").await;
        },
        |server: TestServer| async move {
            let auth_header = build_auth_header(&server).await;

            let response = get_limits(&server, Some(&auth_header)).await;

            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
            let body: serde_json::Value = response.json().await.expect("error json");
            assert_eq!(body["message"], "Extraction is not configured");
        },
    )
    .await;
    assert!(
        // The subscriber keeps only ERROR events, so a match is an error log line.
        logs.contains("document_extraction_limits row is missing"),
        "expected an error log line for the missing limits row"
    );
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_auth_when_get_limits_then_401() {
    run_test_with_test_profile(|server: TestServer| async move {
        let response = get_limits(&server, None).await;

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    })
    .await;
}
