//! SQLite helpers for adapter tests: a migrated file database and row counts.

use std::sync::Arc;

use deadpool_diesel::sqlite::Pool;
use diesel::{QueryableByName, RunQueryDsl};
use tempfile::TempDir;

use crate::infrastructure::shared::db::{create_connection_pool_from_url, run_migrations};

/// A migrated SQLite database in a temporary directory. Keep it in scope:
/// the directory (and the database) is removed on drop.
pub struct TestDatabase {
    pub pool: Arc<Pool>,
    _dir: TempDir,
}

pub async fn migrated_test_database() -> TestDatabase {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_url = format!("file:{}/test.db", dir.path().display());
    let pool = Arc::new(create_connection_pool_from_url(&db_url).expect("create pool"));
    run_migrations(pool.as_ref()).await.expect("run migrations");
    TestDatabase { pool, _dir: dir }
}

/// Counts the rows in `table`. `table` is a fixed test constant, not input.
pub async fn count_rows(pool: &Pool, table: &'static str) -> i64 {
    #[derive(QueryableByName)]
    struct CountRow {
        #[diesel(sql_type = diesel::sql_types::BigInt)]
        count: i64,
    }
    let conn = pool.get().await.expect("pool connection");
    conn.interact(move |conn| {
        diesel::sql_query(format!("SELECT COUNT(*) AS count FROM {table}"))
            .get_result::<CountRow>(conn)
    })
    .await
    .expect("interact")
    .expect("count query")
    .count
}

/// Asserts that no Document and no Document-tag link exists.
pub async fn assert_no_document_rows(pool: &Pool) {
    assert_eq!(count_rows(pool, "documents").await, 0, "orphan documents");
    assert_eq!(
        count_rows(pool, "document_tags").await,
        0,
        "orphan document_tags"
    );
}
