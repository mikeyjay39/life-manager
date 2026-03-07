use std::env;

use deadpool_diesel::sqlite::{Manager, Pool, Runtime};
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use dotenvy::dotenv;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub fn create_connection_pool() -> Pool {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    tracing::info!("Creating connection pool to database at {}", database_url);
    create_connection_pool_from_url(&database_url)
}

pub fn create_connection_pool_from_url(database_url: &str) -> Pool {
    let mgr = Manager::new(database_url.to_string(), Runtime::Tokio1);
    Pool::builder(mgr)
        .max_size(16)
        .build()
        .expect("Failed to create pool.")
}

pub async fn run_migrations(pool: &Pool) -> bool {
    let conn = pool.get().await.expect("Failed to get DB connection");
    let _ = conn
        .interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
}
