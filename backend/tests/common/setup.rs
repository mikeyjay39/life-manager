use std::{
    env::set_var,
    sync::Arc,
    thread::sleep,
    time::Duration,
};

use axum_test::{TestServer, TestServerConfig, Transport};
use deadpool_diesel::sqlite::Pool;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use life_manager::infrastructure::{
    app_state::{AppState, AppStateBuilder},
    auth::login_request::{LoginRequest, LoginResponse},
    db::create_connection_pool_from_url,
};
use reqwest::{Client, ClientBuilder};
use tempfile::NamedTempFile;

use serde_json::json;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
};

use crate::common::docker::{
    docker_compose_down, start_docker_compose_dev_profile, start_docker_compose_test_profile,
};

const AUTH_URL: &str = "/api/v1/auth";

// Embed database migrations
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

/// Run test with all docker containers started via docker-compose
///
/// WARNING: This includes starting the Ollama container which is an expensive process. Very few
/// tests should use this setup function. Unless needing to explicitly test Ollama integration,
/// prefer using `run_test_with_test_profile` which omits the Ollama container.
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
    
    // Start docker compose for Tesseract only
    start_docker_compose_test_profile().await;
    
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
    let state: AppState = AppStateBuilder::new()
        .with_db_pool(Arc::new(pool))
        .build()
        .await;
    let app = life_manager::build_app(Some(state)).await;
    let config = TestServerConfig {
        transport: Some(Transport::HttpRandomPort),
        ..TestServerConfig::default()
    };

    let server = TestServer::new_with_config(app, config).expect("Failed to start test server");
    let health_url = server
        .server_url("/health")
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

async fn run_migrations(pool: &Pool) -> bool {
    let conn = pool.get().await.expect("Failed to get DB connection");
    let _ = conn
        .interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
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
