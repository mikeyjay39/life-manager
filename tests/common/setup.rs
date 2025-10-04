use deadpool_diesel::{Manager, Pool, postgres::Object};
use diesel::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use testcontainers::{ImageExt, core::ContainerPort, runners::AsyncRunner};
use testcontainers_modules::postgres::Postgres;

// Embed database migrations
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

/// Initialize test environment: start Postgres container, run migrations, return connection pool and a connection
pub async fn init_tests() -> (
    Result<
        testcontainers::ContainerAsync<testcontainers_modules::postgres::Postgres>,
        testcontainers::TestcontainersError,
    >,
    deadpool_diesel::Pool<Manager<PgConnection>>,
    Object,
) {
    let container = Postgres::default()
        .with_user("postgres")
        .with_password("password")
        .with_db_name("mydb")
        .with_mapped_port(5432, ContainerPort::Tcp(5432))
        .start()
        .await;
    let host_port = 5432;
    let _url = &format!("postgres://postgres:password@127.0.0.1:{host_port}/mydb",);
    println!("Database URL: {}", _url);

    // Use Diesel to connect to Postgres
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    let pool = family_manager::create_connection_pool();
    let conn = pool.get().await.expect("Failed to get DB connection");
    run_migrations(&pool).await;

    (container, pool, conn)
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
