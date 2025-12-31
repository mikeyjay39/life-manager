use std::{
    env::{self, set_var},
    thread::sleep,
    time::Duration,
};

use axum_test::{TestServer, TestServerConfig, Transport};
use deadpool_diesel::{Manager, Pool};
use diesel::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use dotenvy::dotenv;
use reqwest::Client;
use serde_json::json;
use testcontainers::runners::AsyncRunner;
use testcontainers_modules::postgres::Postgres;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
};

use crate::common::docker::{
    docker_compose_down, start_docker_compose_dev_profile, start_docker_compose_test_profile,
};

// Embed database migrations
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub struct IntegrationTestContainer {
    pub postgres: testcontainers::ContainerAsync<testcontainers_modules::postgres::Postgres>,
}
impl IntegrationTestContainer {
    pub async fn new() -> Self {
        IntegrationTestContainer {
            postgres: Postgres::default()
                .with_user("postgres")
                .with_password("password")
                .with_db_name("mydb")
                .start()
                .await
                .expect("Failed to start Postgres container"),
        }
    }
    pub async fn get_connection_url(&self) -> String {
        let port = self
            .postgres
            .get_host_port_ipv4(5432)
            .await
            .expect("Failed to get host port");
        format!("postgres://postgres:password@127.0.0.1:{}/mydb", port)
    }
}

impl Drop for IntegrationTestContainer {
    fn drop(&mut self) {
        tracing::info!("Shutting down the container...");
        // The container will automatically stop
    }
}

pub async fn run_test<F, Fut>(test: F)
where
    F: FnOnce(&IntegrationTestContainer, TestServer) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    tracing::info!("Starting beforeEach setup");
    // beforeEach
    dotenv().ok();
    let (container, server) = init_tests().await;
    let url = server
        .server_address()
        .expect("Failed to get server address");

    // run test
    tracing::info!("Running test on url {url}");
    test(&container, server).await;

    // afterEach (async cleanup)
    // container is dropped automatically, but you could do more here
    tracing::info!("Cleaning up container");
    container
        .postgres
        .stop()
        .await
        .expect("Failed to stop container");
    let is_runnging = container.postgres.is_running().await;
    match is_runnging {
        Ok(running) => {
            if running {
                tracing::info!("Container is still running!");
            } else {
                tracing::info!("Container has been stopped.");
            }
        }
        Err(_) => {
            tracing::info!("Container returned error when checking if running.");
        }
    }
}

/**
* Run test with all docker containers started via docker-compose
* WARNING: This includes starting the Ollama container which is an expensive process. Very few
* tests should use this setup function. Unless needing to explicitly test Ollama integration,
* prefer using `run_test` which uses a lightweight Postgres container only and mock other services.
*/
pub async fn run_test_with_all_containers<F, Fut>(test: F)
where
    F: FnOnce(TestServer) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    tracing::info!("Starting beforeEach setup");
    // beforeEach
    start_docker_compose_dev_profile().await;
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
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
    // beforeEach
    start_docker_compose_test_profile().await;
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let ollama: MockServer = mock_ollama_response().await;

    unsafe {
        set_var("OLLAMA_URL", ollama.uri());
    }

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

/**
* Build the application server with the given database URL
* and runs migrations.
*/
pub async fn build_app_server(url: &str) -> TestServer {
    // Use Diesel to connect to Postgres
    tracing::info!("Creating connection pool...");

    let pool = life_manager::create_connection_pool_from_url(url);
    let _conn = pool.get().await.expect("Failed to get DB connection");
    tracing::info!("Running migrations...");
    run_migrations(&pool).await;
    tracing::info!("Building backend app...");
    let app = life_manager::build_app(pool).await;
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

/**
 * Initialize the test environment: start container, run migrations, build server
 */
pub async fn init_tests() -> (IntegrationTestContainer, TestServer) {
    tracing::info!("Building Postgres container...");
    let container = IntegrationTestContainer::new().await;
    let url = container.get_connection_url().await;
    tracing::info!("Database URL: {}", url);
    let server = build_app_server(&url).await;
    (container, server)
}

/// Run pending migrations
async fn run_migrations(pool: &Pool<Manager<PgConnection>>) -> bool {
    // Get a database connection from the pool
    let conn = pool.get().await.expect("Failed to get DB connection");
    // Run pending migrations on the connection
    let _ = conn
        .interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
}
