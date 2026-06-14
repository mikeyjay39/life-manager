use std::{env::set_var, path::Path, sync::Arc, thread::sleep, time::Duration};

use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use time::{Duration as TimeDuration, OffsetDateTime};
use uuid::Uuid;

use axum_test::{TestServer, TestServerConfig, Transport};
use life_manager::{
    LifeManagerDeps, LifeManagerStateBuilder,
    infrastructure::db::{create_connection_pool_from_url, run_migrations},
};
use mikeyjay_server::build_app_with_life_manager_state;
use reqwest::{Client, ClientBuilder};
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

use serde_json::json;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
};

use crate::common::docker::{docker_compose_down, start_docker_compose_dev_profile};

const AUTH_URL: &str = "/life-manager/api/v1/auth";

#[derive(Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
}

#[derive(Serialize, Deserialize)]
struct TestClaims {
    sub: Uuid,
    exp: usize,
    tenant: String,
}

pub fn decode_token_tenant(token: &str) -> String {
    let token = token.strip_prefix("Bearer ").unwrap_or(token);
    let secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let claims = decode::<TestClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .expect("Failed to decode token")
    .claims;
    claims.tenant
}

pub fn build_bearer_token_with_tenant(user_id: Uuid, tenant: &str) -> String {
    let secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let exp = OffsetDateTime::now_utc() + TimeDuration::hours(1);
    let claims = TestClaims {
        sub: user_id,
        exp: exp.unix_timestamp() as usize,
        tenant: tenant.to_string(),
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("Failed to encode test token");
    format!("Bearer {token}")
}

/// Run test with all docker containers started via the repository root `docker-compose.yml`.
///
/// WARNING: This includes starting the Ollama container which is an expensive process. Very few
/// tests should use this setup function. Unless needing to explicitly test Ollama integration,
/// prefer using `run_test_with_test_profile` which omits the Ollama container.
#[allow(dead_code)]
pub async fn run_test_with_all_containers<F, Fut>(test: F)
where
    F: FnOnce(TestServer) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    tracing::info!("Starting beforeEach setup");
    // beforeEach
    start_docker_compose_dev_profile().await;

    // Create temp SQLite database file
    let temp_db = NamedTempFile::new().expect("Failed to create temp DB file");
    let db_path = temp_db.path().to_str().unwrap();
    let database_url = db_path.to_string();

    let server = build_app_server(&database_url).await;
    let url = server
        .server_address()
        .expect("Failed to get server address");

    // run test
    tracing::info!("Running test on url {url}");
    test(server).await;

    // afterEach (async cleanup)
    tracing::info!("Tests completed with all containers.");
    docker_compose_down();
}

pub async fn run_test_with_test_profile<F, Fut>(test: F)
where
    F: FnOnce(TestServer) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    tracing::info!("Starting beforeEach setup");

    // Create temp SQLite database file
    let temp_db = NamedTempFile::new().expect("Failed to create temp DB file");
    let db_path = temp_db.path().to_str().unwrap();
    let database_url = db_path.to_string();
    tracing::info!("Created temp SQLite database at {}", db_path);

    let test_env_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.test.env");
    dotenv::from_filename(&test_env_path).ok();

    let ollama: MockServer = mock_ollama_response().await;

    unsafe {
        set_var("OLLAMA_URL", ollama.uri());
        set_var("DATABASE_URL", &database_url);
    }

    let server = build_app_server(&database_url).await;
    let url = server
        .server_address()
        .expect("Failed to get server address");

    // run test
    tracing::info!("Running test on url {url}");
    test(server).await;

    // afterEach (async cleanup)
    // Temp file auto-deleted when temp_db goes out of scope
    tracing::info!("Tests completed with test profile.");
    docker_compose_down();
}

async fn mock_ollama_response() -> MockServer {
    let server = MockServer::start().await;

    let response = json!({
        "model": "llama2",
        "created_at": "2024-05-10T18:42:02.012Z",
        "response": "A friendly hello greeting\nhello world",
        "done": true
    });

    Mock::given(method("POST"))
        .and(path("/api/generate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response))
        .mount(&server)
        .await;

    tracing::info!("Mocked Ollama server at {}", server.uri());
    server
}

/// Build the application server with the given database URL
/// and runs migrations.
pub async fn build_app_server(url: &str) -> TestServer {
    tracing::info!("Creating SQLite connection pool...");

    let pool = create_connection_pool_from_url(url);
    let _conn = pool.get().await.expect("Failed to get DB connection");
    tracing::info!("Running migrations...");
    run_migrations(&pool).await;
    tracing::info!("Building backend app...");
    let state = LifeManagerStateBuilder::new()
        .build(LifeManagerDeps {
            db_pool: Some(Arc::new(pool)),
            ..LifeManagerDeps::default()
        })
        .await;
    let app = build_app_with_life_manager_state(state).await;
    let config = TestServerConfig {
        transport: Some(Transport::HttpRandomPort),
        ..TestServerConfig::default()
    };

    let server = TestServer::new_with_config(app, config).expect("Failed to start test server");
    let health_url = server
        .server_url("/api/health")
        .expect("Failed to get server URL");

    wait_for_service_to_be_ready(health_url.as_str(), "Life Manager Backend").await;
    server
}

pub async fn wait_for_service_to_be_ready(url: &str, service_name: &str) {
    let client = Client::new();

    for attempt in 0..30 {
        if let Ok(resp) = client.get(url).send().await
            && resp.status().is_success()
        {
            tracing::info!("{} is ready!", service_name);
            return;
        }
        tracing::info!(
            "Attemp {} Waiting for {} to become ready...",
            attempt,
            service_name
        );
        sleep(Duration::from_secs(1));
    }

    panic!("{} did not become ready at {}", service_name, url);
}

pub async fn build_auth_header(server: &TestServer) -> String {
    let username = "admin";
    let password = "password";

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
    format!("Bearer {}", login_response.token)
}
