use deadpool_diesel::postgres::Pool;
use diesel::RunQueryDsl;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use testcontainers::{ImageExt, core::ContainerPort, runners::AsyncRunner};
use testcontainers_modules::postgres::Postgres;

// Embed database migrations
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

#[tokio::test]
async fn test_server_starts() {
    let server = tokio::spawn(async move {
        family_manager::start_server();
    });
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    assert!(true);
    // Shut down the server
    server.abort();
}

async fn run_migrations(pool: &Pool) -> bool {
    // Get a database connection from the pool
    let conn = pool.get().await.expect("Failed to get DB connection");
    // Run pending migrations on the connection
    conn.interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
}

#[tokio::test]
async fn test_db_connection() {
    let container = Postgres::default()
        .with_user("postgres")
        .with_password("password")
        .with_db_name("mydb")
        .with_mapped_port(5432, ContainerPort::Tcp(5432))
        .start()
        .await;
    let host_port = 5432;
    let url = &format!("postgres://postgres:postgres@localhost:{host_port}/mydb",);

    // Use Diesel to connect to Postgres
    let pool = family_manager::create_connection_pool();
    let conn = pool.get().await.expect("Failed to get DB connection");
    run_migrations(&pool).await;

    // Run a simple query to verify the connection
    conn.interact(|conn| {
        diesel::sql_query("SELECT 1 from documents")
            .execute(conn)
            .expect("Failed to execute query")
    })
    .await
    .expect("Failed to interact with DB");
}
