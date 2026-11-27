#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
//! The table-rebuild migration must keep every row, including the
//! `ON DELETE CASCADE` children, on a connection with foreign keys on.

use std::collections::BTreeMap;

use diesel::connection::SimpleConnection;
use diesel::migration::MigrationSource;
use diesel::sqlite::Sqlite;
use diesel::{QueryableByName, RunQueryDsl, SqliteConnection};
use diesel_migrations::MigrationHarness;
use life_manager::infrastructure::shared::db::{MIGRATIONS, create_connection_pool_from_url};

const REBUILD_MIGRATION: &str = "2026-11-27-000000_align_column_types_with_schema";

/// Tables with their primary key order. The rebuild touches the first four;
/// the last two are their `ON DELETE CASCADE` children.
const TABLES: [(&str, &str); 6] = [
    ("documents", "id"),
    ("health_members", "id"),
    ("health_readings", "id"),
    ("cars", "id"),
    ("document_tags", "document_id, tag_id"),
    ("car_maintenance_events", "id"),
];

const NULL_CREATED_AT_DOCUMENT: &str = "00000000-0000-0000-0000-0000000000d3";

#[derive(QueryableByName)]
struct TextRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    value: String,
}

#[derive(QueryableByName)]
struct IntRow {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    value: i64,
}

fn query_text(conn: &mut SqliteConnection, sql: &str) -> Vec<String> {
    diesel::sql_query(sql)
        .load::<TextRow>(conn)
        .unwrap_or_else(|err| panic!("query failed: {sql}: {err}"))
        .into_iter()
        .map(|row| row.value)
        .collect()
}

fn query_int(conn: &mut SqliteConnection, sql: &str) -> i64 {
    diesel::sql_query(sql)
        .get_result::<IntRow>(conn)
        .unwrap_or_else(|err| panic!("query failed: {sql}: {err}"))
        .value
}

/// Every row of every table as text, in primary-key order. `quote()` keeps
/// the stored value and its storage class (NULL, integer, real, text).
fn snapshot(conn: &mut SqliteConnection) -> BTreeMap<&'static str, Vec<String>> {
    TABLES
        .iter()
        .map(|(table, order_by)| {
            let columns = query_text(
                conn,
                &format!("SELECT name AS value FROM pragma_table_info('{table}') ORDER BY cid"),
            );
            let row_expression = columns
                .iter()
                .map(|column| format!("'{column}=' || quote({column})"))
                .collect::<Vec<_>>()
                .join(" || ', ' || ");
            let rows = query_text(
                conn,
                &format!("SELECT {row_expression} AS value FROM {table} ORDER BY {order_by}"),
            );
            (*table, rows)
        })
        .collect()
}

fn row_counts(snapshot: &BTreeMap<&'static str, Vec<String>>) -> BTreeMap<&'static str, usize> {
    snapshot
        .iter()
        .map(|(table, rows)| (*table, rows.len()))
        .collect()
}

/// The rebuild gives the NULL `created_at` a value. Drop it from the compare.
fn without_backfilled_created_at(
    mut snapshot: BTreeMap<&'static str, Vec<String>>,
) -> BTreeMap<&'static str, Vec<String>> {
    if let Some(rows) = snapshot.get_mut("documents") {
        for row in rows.iter_mut() {
            if row.contains(NULL_CREATED_AT_DOCUMENT) {
                *row = row
                    .split(", ")
                    .filter(|field| !field.starts_with("created_at="))
                    .collect::<Vec<_>>()
                    .join(", ");
            }
        }
    }
    snapshot
}

fn next_pending_migration(conn: &mut SqliteConnection) -> String {
    conn.pending_migrations(MIGRATIONS)
        .expect("pending migrations")
        .first()
        .expect("rebuild migration is pending")
        .name()
        .to_string()
}

fn run_migrations_before_rebuild(conn: &mut SqliteConnection) {
    let all_names: Vec<String> = MigrationSource::<Sqlite>::migrations(&MIGRATIONS)
        .expect("migrations")
        .iter()
        .map(|migration| migration.name().to_string())
        .collect();
    assert!(
        all_names.iter().any(|name| name == REBUILD_MIGRATION),
        "missing {REBUILD_MIGRATION} in {all_names:?}"
    );
    while next_pending_migration(conn) != REBUILD_MIGRATION {
        conn.run_next_migration(MIGRATIONS)
            .expect("earlier migration");
    }
}

fn insert_sample_rows(conn: &mut SqliteConnection) {
    conn.batch_execute(
        "
        INSERT INTO documents (id, title, content, user_id, created_at, issued_date, storage_provider)
        VALUES
            ('00000000-0000-0000-0000-0000000000d1', 'Tax 2025', 'body 1',
             '00000000-0000-0000-0000-000000000001', '2026-01-01 10:00:00', '2025-04-15 00:00:00', 'proton_drive'),
            ('00000000-0000-0000-0000-0000000000d2', 'Insurance', 'body 2',
             '00000000-0000-0000-0000-000000000001', '2026-02-01 11:30:00', NULL, NULL),
            ('00000000-0000-0000-0000-0000000000d3', 'Legacy', 'body 3',
             '00000000-0000-0000-0000-000000000001', NULL, NULL, NULL);
        INSERT INTO tags (id, name) VALUES
            ('00000000-0000-0000-0000-0000000000a1', 'Tax'),
            ('00000000-0000-0000-0000-0000000000a2', 'Car');
        INSERT INTO document_tags (document_id, tag_id) VALUES
            ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1'),
            ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2'),
            ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1');

        INSERT INTO cars (id, user_id, make, model, year, vin, active, created_at, updated_at, deactivated_at)
        VALUES
            ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001',
             'Toyota', 'Corolla', 2020, '1HGCM82633A004352', 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00', NULL),
            ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001',
             'Honda', 'Civic', 2018, NULL, 0, '2026-01-02 00:00:00', '2026-01-03 00:00:00', '2026-01-03 00:00:00');
        INSERT INTO car_maintenance_events (
            id, user_id, car_id, occurred_on, event_type, odometer_miles, cost_cents,
            title, notes, document_id, created_at, updated_at
        ) VALUES
            ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000c1', '2026-01-02', 'oil_change', 42000, 4999,
             NULL, NULL, '00000000-0000-0000-0000-0000000000d2', '2026-01-02 00:00:00', '2026-01-02 00:00:00'),
            ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000c2', '2026-01-05', 'tires', NULL, 60000,
             'Winter tires', 'note', NULL, '2026-01-05 00:00:00', '2026-01-05 00:00:00');

        INSERT INTO health_members (id, user_id, display_name, birth_date, notes, active, created_at, updated_at, deactivated_at)
        VALUES
            ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001',
             'Alex', '1990-05-01', NULL, 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00', NULL),
            ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001',
             'Sam', NULL, 'inactive', 0, '2026-01-01 00:00:00', '2026-01-04 00:00:00', '2026-01-04 00:00:00');
        INSERT INTO health_readings (
            id, user_id, health_member_id, recorded_on, height_cm, weight_kg,
            systolic_mm_hg, diastolic_mm_hg, heart_rate_bpm, notes, created_at, updated_at
        ) VALUES
            ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000b1', '2026-01-10', 172.35, 68.125,
             120, 80, 62, NULL, '2026-01-10 00:00:00', '2026-01-10 00:00:00'),
            ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000b1', '2026-01-11', NULL, 67.9,
             NULL, NULL, NULL, 'weight only', '2026-01-11 00:00:00', '2026-01-11 00:00:00');
        ",
    )
    .expect("insert sample rows");
}

fn assert_foreign_keys_on_and_consistent(conn: &mut SqliteConnection) {
    assert_eq!(
        query_int(
            conn,
            "SELECT foreign_keys AS value FROM pragma_foreign_keys"
        ),
        1,
        "foreign keys must be on again after the migration"
    );
    assert_eq!(
        query_int(
            conn,
            "SELECT COUNT(*) AS value FROM pragma_foreign_key_check"
        ),
        0,
        "foreign_key_check must return no rows"
    );
}

fn assert_column_type(conn: &mut SqliteConnection, table: &str, column: &str, expected: &str) {
    let declared = query_text(
        conn,
        &format!("SELECT type AS value FROM pragma_table_info('{table}') WHERE name = '{column}'"),
    );
    assert_eq!(declared, vec![expected.to_string()], "{table}.{column}");
}

#[tokio::test]
async fn given_rows_in_rebuilt_tables_when_migrate_up_and_down_then_no_row_is_lost() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_url = format!("file:{}/rebuild.db", dir.path().display());
    let pool = create_connection_pool_from_url(&db_url).expect("create pool");
    let conn = pool.get().await.expect("pool connection");

    conn.interact(|conn| {
        assert_eq!(
            query_int(
                conn,
                "SELECT foreign_keys AS value FROM pragma_foreign_keys"
            ),
            1,
            "the pool turns foreign keys on, as the server does"
        );
        run_migrations_before_rebuild(conn);
        insert_sample_rows(conn);
        let before = snapshot(conn);

        conn.run_next_migration(MIGRATIONS)
            .expect("rebuild migration up");

        let after_up = snapshot(conn);
        assert_eq!(row_counts(&after_up), row_counts(&before));
        assert_eq!(
            without_backfilled_created_at(after_up),
            without_backfilled_created_at(before.clone())
        );
        let null_created_at = query_int(
            conn,
            "SELECT COUNT(*) AS value FROM documents WHERE created_at IS NULL",
        );
        assert_eq!(null_created_at, 0, "the NULL created_at must get a value");
        assert_column_type(conn, "cars", "active", "BOOLEAN");
        assert_column_type(conn, "health_members", "active", "BOOLEAN");
        assert_column_type(conn, "health_readings", "height_cm", "DOUBLE");
        assert_column_type(conn, "health_readings", "weight_kg", "DOUBLE");
        assert_foreign_keys_on_and_consistent(conn);

        conn.revert_last_migration(MIGRATIONS)
            .expect("rebuild migration down");

        let after_down = snapshot(conn);
        assert_eq!(row_counts(&after_down), row_counts(&before));
        assert_eq!(
            without_backfilled_created_at(after_down),
            without_backfilled_created_at(before)
        );
        assert_column_type(conn, "cars", "active", "INTEGER");
        assert_column_type(conn, "health_readings", "height_cm", "REAL");
        assert_foreign_keys_on_and_consistent(conn);
    })
    .await
    .expect("interact");
}
