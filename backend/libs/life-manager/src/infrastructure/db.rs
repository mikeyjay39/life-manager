use std::{env, fs, path::Path};

use anyhow::Context;
use deadpool_diesel::sqlite::{Hook, HookError, Manager, Metrics, Pool, Runtime};
use diesel::{RunQueryDsl, sql_query};
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use dotenvy::dotenv;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub fn create_connection_pool() -> anyhow::Result<Pool> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    tracing::info!("Creating connection pool to database at {}", database_url);
    create_connection_pool_from_url(&database_url)
}

pub fn create_connection_pool_from_url(database_url: &str) -> anyhow::Result<Pool> {
    ensure_sqlite_parent_dir_exists(database_url)?;
    let mgr = Manager::new(database_url.to_string(), Runtime::Tokio1);
    // SQLite keeps foreign keys off by default. Enable them on each new
    // connection so ON DELETE CASCADE (and other FKs) are enforced.
    Pool::builder(mgr)
        .post_create(Hook::sync_fn(|conn, _metrics: &Metrics| {
            let mut guard = conn
                .lock()
                .map_err(|_| HookError::message("failed to lock sqlite connection"))?;
            sql_query("PRAGMA foreign_keys = ON")
                .execute(&mut *guard)
                .map_err(|err| {
                    HookError::message(format!("failed to enable sqlite foreign_keys: {err}"))
                })?;
            Ok(())
        }))
        .max_size(16)
        .build()
        .context("Failed to create pool")
}

fn ensure_sqlite_parent_dir_exists(database_url: &str) -> std::io::Result<()> {
    if is_in_memory_sqlite(database_url) {
        return Ok(());
    }

    let path_str = if let Some(file_uri_path) = database_url.strip_prefix("file:") {
        file_uri_path.split('?').next().unwrap_or(file_uri_path)
    } else {
        database_url
    };

    let path = Path::new(path_str);
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }

    fs::create_dir_all(parent).map_err(|err| {
        std::io::Error::other(format!(
            "Failed to create SQLite parent directory '{}': {err}",
            parent.display()
        ))
    })
}

fn is_in_memory_sqlite(database_url: &str) -> bool {
    database_url == ":memory:"
        || database_url.starts_with("file::memory:")
        || database_url.starts_with("file:?mode=memory")
        || database_url.starts_with("file:") && database_url.contains("mode=memory")
}

pub async fn run_migrations(pool: &Pool) -> anyhow::Result<()> {
    let conn = pool.get().await.context("Failed to get DB connection")?;
    conn.interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .map_err(|err| anyhow::anyhow!("Failed to run life-manager migrations interact: {err:?}"))?
        .map_err(|err| anyhow::anyhow!("Failed to run pending life-manager migrations: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod migration_tests {
    use std::sync::Arc;

    use diesel::{QueryableByName, RunQueryDsl};
    use uuid::Uuid;

    use crate::application::document_repository::DocumentRepository;
    use crate::infrastructure::document::document_orm_collection::DocumentOrmCollection;

    use super::*;

    #[tokio::test]
    async fn run_migrations_applies_created_at_to_legacy_schema() {
        let dir = tempfile::tempdir().unwrap();
        let db_url = format!("file:{}/legacy.db", dir.path().display());
        let pool = Arc::new(create_connection_pool_from_url(&db_url).expect("create pool"));

        run_migrations(pool.as_ref()).await.expect("run migrations");

        let conn = pool.get().await.expect("pool connection");
        conn.interact(|conn| -> Result<(), diesel::result::Error> {
            diesel::sql_query(
                "DELETE FROM __diesel_schema_migrations WHERE version = '20260711000000'",
            )
            .execute(conn)?;
            diesel::sql_query("ALTER TABLE documents DROP COLUMN expire_date").execute(conn)?;
            diesel::sql_query("ALTER TABLE documents DROP COLUMN issued_date").execute(conn)?;
            diesel::sql_query("ALTER TABLE documents DROP COLUMN created_at").execute(conn)?;
            diesel::sql_query(
                "INSERT INTO documents (id, title, content, user_id) VALUES ('00000000-0000-0000-0000-0000000000aa', 'legacy', 'content', '00000000-0000-0000-0000-000000000001')",
            )
            .execute(conn)?;
            Ok(())
        })
        .await
        .expect("legacy downgrade interact")
        .expect("legacy downgrade");

        let repo = DocumentOrmCollection::new(pool.clone());
        let user_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        assert!(
            repo.get_documents(&user_id, &100).await.is_empty(),
            "legacy schema should return no documents before migration"
        );

        run_migrations(pool.as_ref()).await.expect("run migrations");

        let docs = repo.get_documents(&user_id, &100).await;
        assert_eq!(docs.len(), 1, "documents should load after migration");
        assert_eq!(docs[0].title, "legacy");
    }

    #[tokio::test]
    async fn run_migrations_creates_health_readings_table() {
        let dir = tempfile::tempdir().unwrap();
        let db_url = format!("file:{}/health_readings.db", dir.path().display());
        let pool = Arc::new(create_connection_pool_from_url(&db_url).expect("create pool"));

        run_migrations(pool.as_ref()).await.expect("run migrations");

        let conn = pool.get().await.expect("pool connection");
        let column_names = conn
            .interact(|conn| -> Result<Vec<String>, diesel::result::Error> {
                #[derive(QueryableByName)]
                struct ColumnName {
                    #[diesel(sql_type = diesel::sql_types::Text)]
                    name: String,
                }
                let rows: Vec<ColumnName> =
                    diesel::sql_query("PRAGMA table_info(health_readings)").load(conn)?;
                Ok(rows.into_iter().map(|r| r.name).collect())
            })
            .await
            .expect("interact")
            .expect("pragma");

        for required in [
            "id",
            "user_id",
            "health_member_id",
            "recorded_on",
            "height_cm",
            "weight_kg",
            "systolic_mm_hg",
            "diastolic_mm_hg",
            "heart_rate_bpm",
            "notes",
            "created_at",
            "updated_at",
        ] {
            assert!(
                column_names.iter().any(|n| n == required),
                "missing column {required}; have {column_names:?}"
            );
        }
    }

    #[tokio::test]
    async fn run_migrations_creates_car_maintenance_events_table() {
        let dir = tempfile::tempdir().unwrap();
        let db_url = format!("file:{}/car_maintenance_events.db", dir.path().display());
        let pool = Arc::new(create_connection_pool_from_url(&db_url).expect("create pool"));

        run_migrations(pool.as_ref()).await.expect("run migrations");

        let conn = pool.get().await.expect("pool connection");
        let column_names = conn
            .interact(|conn| -> Result<Vec<String>, diesel::result::Error> {
                #[derive(QueryableByName)]
                struct ColumnName {
                    #[diesel(sql_type = diesel::sql_types::Text)]
                    name: String,
                }
                let rows: Vec<ColumnName> =
                    diesel::sql_query("PRAGMA table_info(car_maintenance_events)").load(conn)?;
                Ok(rows.into_iter().map(|r| r.name).collect())
            })
            .await
            .expect("interact")
            .expect("pragma");

        for required in [
            "id",
            "user_id",
            "car_id",
            "occurred_on",
            "event_type",
            "odometer_miles",
            "cost_cents",
            "title",
            "notes",
            "document_id",
            "created_at",
            "updated_at",
        ] {
            assert!(
                column_names.iter().any(|n| n == required),
                "missing column {required}; have {column_names:?}"
            );
        }
    }

    #[tokio::test]
    async fn car_hard_delete_cascades_maintenance_events() {
        let dir = tempfile::tempdir().unwrap();
        let db_url = format!("file:{}/car_cascade.db", dir.path().display());
        let pool = Arc::new(create_connection_pool_from_url(&db_url).expect("create pool"));

        run_migrations(pool.as_ref()).await.expect("run migrations");

        let conn = pool.get().await.expect("pool connection");
        let remaining = conn
            .interact(|conn| -> Result<i64, diesel::result::Error> {
                diesel::sql_query(
                    "INSERT INTO cars (
                        id, user_id, make, model, year, active, created_at, updated_at
                    ) VALUES (
                        '00000000-0000-0000-0000-0000000000c1',
                        '00000000-0000-0000-0000-000000000001',
                        'Toyota', 'Corolla', 2020, 1,
                        '2026-01-01 00:00:00', '2026-01-01 00:00:00'
                    )",
                )
                .execute(conn)?;
                diesel::sql_query(
                    "INSERT INTO car_maintenance_events (
                        id, user_id, car_id, occurred_on, event_type,
                        odometer_miles, cost_cents, title, notes, document_id,
                        created_at, updated_at
                    ) VALUES (
                        '00000000-0000-0000-0000-0000000000e1',
                        '00000000-0000-0000-0000-000000000001',
                        '00000000-0000-0000-0000-0000000000c1',
                        '2026-01-02', 'oil_change', 42000, 4999, NULL, NULL, NULL,
                        '2026-01-02 00:00:00', '2026-01-02 00:00:00'
                    )",
                )
                .execute(conn)?;
                diesel::sql_query(
                    "DELETE FROM cars WHERE id = '00000000-0000-0000-0000-0000000000c1'",
                )
                .execute(conn)?;

                #[derive(QueryableByName)]
                struct CountRow {
                    #[diesel(sql_type = diesel::sql_types::BigInt)]
                    count: i64,
                }
                let rows: Vec<CountRow> = diesel::sql_query(
                    "SELECT COUNT(*) AS count FROM car_maintenance_events
                     WHERE id = '00000000-0000-0000-0000-0000000000e1'",
                )
                .load(conn)?;
                Ok(rows[0].count)
            })
            .await
            .expect("interact")
            .expect("cascade delete");

        assert_eq!(
            remaining, 0,
            "maintenance events must cascade-delete with the car"
        );
    }
}
