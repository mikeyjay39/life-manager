use deadpool_diesel::{Manager, Pool};
use diesel::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::net::TcpListener;
use testcontainers::{ImageExt, core::ContainerPort, runners::AsyncRunner};
use testcontainers_modules::postgres::Postgres;
use tokio::spawn;

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
                .with_mapped_port(5432, ContainerPort::Tcp(5432))
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
        println!("Shutting down the container...");
        // The container will automatically stop
    }
}

/// Initialize test environment: start Postgres container, run migrations, return connection pool and a connection
/// TODO: Add a mutex to this to prevent race conditions when running multiple tests in parallel
/// Work around now its to launch tests with 1 thread: `cargo test -- --test-threads=1`
pub async fn init_tests() -> (IntegrationTestContainer, std::net::SocketAddr) {
    let container = IntegrationTestContainer::new().await;
    let url = container.get_connection_url().await;
    println!("Database URL: {}", url);

    // Use Diesel to connect to Postgres
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    let pool = family_manager::create_connection_pool();
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
