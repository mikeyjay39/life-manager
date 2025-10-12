use deadpool_diesel::{Manager, Pool};
use diesel::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::net::TcpListener;
use testcontainers::runners::AsyncRunner;
use testcontainers_modules::postgres::Postgres;
use tokio::{spawn, sync::Mutex};

use lazy_static::lazy_static;

lazy_static! {
    pub static ref TEST_MUTEX: Mutex<()> = Mutex::new(());
}

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
                // .with_mapped_port(5432, ContainerPort::Tcp(5432))
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
    F: FnOnce(&IntegrationTestContainer, std::net::SocketAddr) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    // beforeEach
    let _lock = TEST_MUTEX.lock().await;
    let (container, addr) = init_tests().await;
    let port = addr.port();

    // run test
    test(&container, addr).await;

    // afterEach (async cleanup)
    // container is dropped automatically, but you could do more here
    tracing::info!("Cleaning up container on port {port}");
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

/// Initialize test environment: start Postgres container, run migrations, return connection pool and a connection
/// TODO: Add a mutex to this to prevent race conditions when running multiple tests in parallel
/// Work around now its to launch tests with 1 thread: `cargo test -- --test-threads=1`
pub async fn init_tests() -> (IntegrationTestContainer, std::net::SocketAddr) {
    let container = IntegrationTestContainer::new().await;
    let url = container.get_connection_url().await;
    tracing::info!("Database URL: {}", url);

    // Use Diesel to connect to Postgres
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    let pool = family_manager::create_connection_pool_from_url(&url);
    let _conn = pool.get().await.expect("Failed to get DB connection");
    run_migrations(&pool).await;

    // Launch backend server in a separate task
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let app = family_manager::build_app(pool).await;
    let server = axum::Server::from_tcp(listener)
        .unwrap()
        .serve(app.into_make_service());
    spawn(server);
    (container, addr)
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
