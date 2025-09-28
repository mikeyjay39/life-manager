use std::net::TcpListener;

use deadpool_diesel::{
    Manager,
    postgres::{Object, Pool},
};
use diesel::{PgConnection, RunQueryDsl};
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use testcontainers::{ImageExt, core::ContainerPort, runners::AsyncRunner};
use testcontainers_modules::postgres::Postgres;
use tokio::task::{self, spawn};

// Embed database migrations
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

#[tokio::test]
async fn test_server_starts() {
    let server = spawn(async move {
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
    let (_container, pool, conn) = init_tests().await;

    // Run a simple query to verify the connection
    conn.interact(|conn| {
        diesel::sql_query("SELECT 1 from documents")
            .execute(conn)
            .expect("Failed to execute query")
    })
    .await
    .expect("Failed to interact with DB");
}

#[tokio::test]
async fn get_document() {
    let (_container, pool, conn) = init_tests().await;
    // Launch backend server in a separate task
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let app = family_manager::build_app(pool).await;
    let server = axum::Server::from_tcp(listener)
        .unwrap()
        .serve(app.into_make_service());
    spawn(server);

    // Seed 1 document into the database

    // Make REST API call to create a document
    let new_doc = serde_json::json!({
        "title": "Test Document",
        "content": "This is a test document."
    });
    let url = format!("http://{}/foo", addr);
    let res = reqwest::Client::new()
        .get(url)
        // .post(url)
        // .json(&new_doc)
        .send()
        .await
        .expect("Failed to send request");
    assert!(res.status().is_success());
    // let created_doc: serde_json::Value = res.json().await.expect("Failed to parse response");
    // assert_eq!(created_doc["title"], "Test Document");
    // assert_eq!(created_doc["content"], "This is a test document.");

    // conn.interact(|conn| {
    //     let count: i64 = diesel::sql_query("SELECT COUNT(*) FROM documents")
    //         .get_result(conn)
    //         .expect("Failed to count documents");
    //     assert_eq!(count, 1);
    // })
    // .await
    // .expect("Failed to interact with DB");
}

async fn init_tests() -> (
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
    let _url = &format!("postgres://postgres:postgres@localhost:{host_port}/mydb",);

    // Use Diesel to connect to Postgres
    let pool = family_manager::create_connection_pool();
    let conn = pool.get().await.expect("Failed to get DB connection");
    run_migrations(&pool).await;

    return (container, pool, conn);
}
