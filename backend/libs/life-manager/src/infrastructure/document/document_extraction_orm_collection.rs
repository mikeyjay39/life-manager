//! SQLite adapter for the extraction limits row and per-user daily usage.
//!
//! It uses `diesel::sql_query` with `QueryableByName` rows, so the
//! `document_extraction_*` tables need no `schema.rs` entry.

use std::sync::Arc;

use anyhow::Context;
use async_trait::async_trait;
use chrono::NaiveDate;
use deadpool_diesel::sqlite::Pool;
use diesel::sql_types::{BigInt, Text};
use diesel::{OptionalExtension, QueryableByName, RunQueryDsl};
use uuid::Uuid;

use crate::domain::document::extraction_limits::{ExtractionLimits, ExtractionLimitsReader};
use crate::domain::document::extraction_usage::{ExtractionUsage, ReserveOutcome};

const SELECT_LIMITS_SQL: &str = "SELECT daily_limit_per_user, max_file_bytes, max_pdf_pages \
     FROM document_extraction_limits WHERE id = 1";

// One statement does the check and the increment, so two concurrent reserves
// cannot both pass the limit. When the row is at the limit, the conflict
// branch updates nothing and RETURNING gives no row.
const RESERVE_SQL: &str = "INSERT INTO document_extraction_usage (user_id, usage_date, count) \
     VALUES (?, ?, 1) \
     ON CONFLICT (user_id, usage_date) DO UPDATE SET count = count + 1 WHERE count < ? \
     RETURNING count";

const SELECT_USAGE_SQL: &str =
    "SELECT count FROM document_extraction_usage WHERE user_id = ? AND usage_date = ?";

#[derive(Clone)]
pub struct DocumentExtractionOrmCollection {
    pool: Arc<Pool>,
}

impl DocumentExtractionOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[derive(QueryableByName)]
struct LimitsRow {
    #[diesel(sql_type = BigInt)]
    daily_limit_per_user: i64,
    #[diesel(sql_type = BigInt)]
    max_file_bytes: i64,
    #[diesel(sql_type = BigInt)]
    max_pdf_pages: i64,
}

impl TryFrom<LimitsRow> for ExtractionLimits {
    type Error = anyhow::Error;

    fn try_from(row: LimitsRow) -> anyhow::Result<Self> {
        Ok(Self {
            daily_limit_per_user: u32::try_from(row.daily_limit_per_user)
                .context("daily_limit_per_user is out of range")?,
            max_file_bytes: u64::try_from(row.max_file_bytes)
                .context("max_file_bytes is out of range")?,
            max_pdf_pages: u32::try_from(row.max_pdf_pages)
                .context("max_pdf_pages is out of range")?,
        })
    }
}

#[derive(QueryableByName)]
struct CountRow {
    #[diesel(sql_type = BigInt)]
    count: i64,
}

impl CountRow {
    fn into_count(self) -> anyhow::Result<u32> {
        u32::try_from(self.count).context("usage count is out of range")
    }
}

fn usage_date_text(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

#[async_trait]
impl ExtractionLimitsReader for DocumentExtractionOrmCollection {
    async fn load(&self) -> anyhow::Result<Option<ExtractionLimits>> {
        let conn = self
            .pool
            .get()
            .await
            .context("Failed to get DB connection for extraction limits")?;
        let row = conn
            .interact(|conn| {
                diesel::sql_query(SELECT_LIMITS_SQL)
                    .get_result::<LimitsRow>(conn)
                    .optional()
            })
            .await
            .map_err(|err| anyhow::anyhow!("Extraction limits interact failed: {err:?}"))?
            .context("Failed to select extraction limits")?;
        row.map(ExtractionLimits::try_from).transpose()
    }
}

#[async_trait]
impl ExtractionUsage for DocumentExtractionOrmCollection {
    async fn reserve(
        &self,
        user_id: Uuid,
        today: NaiveDate,
        limit: u32,
    ) -> anyhow::Result<ReserveOutcome> {
        // The insert branch always writes count 1, so limit 0 must stop here.
        if limit == 0 {
            return Ok(ReserveOutcome::LimitReached);
        }
        let conn = self
            .pool
            .get()
            .await
            .context("Failed to get DB connection for extraction reserve")?;
        let rows = conn
            .interact(move |conn| {
                diesel::sql_query(RESERVE_SQL)
                    .bind::<Text, _>(user_id.to_string())
                    .bind::<Text, _>(usage_date_text(today))
                    .bind::<BigInt, _>(i64::from(limit))
                    .load::<CountRow>(conn)
            })
            .await
            .map_err(|err| anyhow::anyhow!("Extraction reserve interact failed: {err:?}"))?
            .context("Failed to reserve extraction unit")?;
        match rows.into_iter().next() {
            Some(row) => Ok(ReserveOutcome::Reserved {
                count: row.into_count()?,
            }),
            None => Ok(ReserveOutcome::LimitReached),
        }
    }

    async fn used_today(&self, user_id: Uuid, today: NaiveDate) -> anyhow::Result<u32> {
        let conn = self
            .pool
            .get()
            .await
            .context("Failed to get DB connection for extraction usage")?;
        let row = conn
            .interact(move |conn| {
                diesel::sql_query(SELECT_USAGE_SQL)
                    .bind::<Text, _>(user_id.to_string())
                    .bind::<Text, _>(usage_date_text(today))
                    .get_result::<CountRow>(conn)
                    .optional()
            })
            .await
            .map_err(|err| anyhow::anyhow!("Extraction usage interact failed: {err:?}"))?
            .context("Failed to select extraction usage")?;
        row.map_or(Ok(0), CountRow::into_count)
    }
}

#[cfg(test)]
mod tests {
    use crate::infrastructure::shared::sqlite_test_support::{
        TestDatabase, count_rows, migrated_test_database,
    };

    use super::*;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 26).expect("valid date")
    }

    async fn given_collection() -> (TestDatabase, DocumentExtractionOrmCollection) {
        let database = migrated_test_database().await;
        let collection = DocumentExtractionOrmCollection::new(database.pool.clone());
        (database, collection)
    }

    #[tokio::test]
    async fn given_fresh_database_when_load_then_seeded_limits() {
        let (_database, collection) = given_collection().await;

        let limits = collection.load().await.expect("load");

        assert_eq!(
            limits,
            Some(ExtractionLimits {
                daily_limit_per_user: 20,
                max_file_bytes: 10_485_760,
                max_pdf_pages: 5,
            })
        );
    }

    #[tokio::test]
    async fn given_limits_row_deleted_when_load_then_none() {
        let (database, collection) = given_collection().await;
        let conn = database.pool.get().await.expect("pool connection");
        conn.interact(|conn| {
            diesel::sql_query("DELETE FROM document_extraction_limits").execute(conn)
        })
        .await
        .expect("interact")
        .expect("delete limits");

        let limits = collection.load().await.expect("load");

        assert_eq!(limits, None);
    }

    #[tokio::test]
    async fn given_limit_2_when_reserve_three_times_then_third_is_limit_reached() {
        let (_database, collection) = given_collection().await;
        let user_id = Uuid::new_v4();

        let first = collection
            .reserve(user_id, today(), 2)
            .await
            .expect("first");
        let second = collection
            .reserve(user_id, today(), 2)
            .await
            .expect("second");
        let third = collection
            .reserve(user_id, today(), 2)
            .await
            .expect("third");

        assert_eq!(first, ReserveOutcome::Reserved { count: 1 });
        assert_eq!(second, ReserveOutcome::Reserved { count: 2 });
        assert_eq!(third, ReserveOutcome::LimitReached);
        assert_eq!(collection.used_today(user_id, today()).await.unwrap(), 2);
    }

    #[tokio::test]
    async fn given_limit_1_when_two_concurrent_reserves_then_one_reserved_one_limit_reached() {
        let (_database, collection) = given_collection().await;
        let user_id = Uuid::new_v4();

        let (first, second) = tokio::join!(
            collection.reserve(user_id, today(), 1),
            collection.reserve(user_id, today(), 1)
        );
        let mut outcomes = vec![first.expect("first"), second.expect("second")];
        outcomes.sort_by_key(|outcome| matches!(outcome, ReserveOutcome::LimitReached));

        assert_eq!(
            outcomes,
            vec![
                ReserveOutcome::Reserved { count: 1 },
                ReserveOutcome::LimitReached
            ]
        );
    }

    #[tokio::test]
    async fn given_all_units_used_yesterday_when_reserve_next_date_then_reserved() {
        let (_database, collection) = given_collection().await;
        let user_id = Uuid::new_v4();
        let yesterday = today().pred_opt().expect("previous date");
        collection.reserve(user_id, yesterday, 1).await.unwrap();
        assert_eq!(
            collection.reserve(user_id, yesterday, 1).await.unwrap(),
            ReserveOutcome::LimitReached
        );

        let outcome = collection
            .reserve(user_id, today(), 1)
            .await
            .expect("reserve");

        assert_eq!(outcome, ReserveOutcome::Reserved { count: 1 });
    }

    #[tokio::test]
    async fn given_limit_0_when_reserve_then_limit_reached_and_no_usage_row() {
        let (database, collection) = given_collection().await;

        let outcome = collection
            .reserve(Uuid::new_v4(), today(), 0)
            .await
            .expect("reserve");

        assert_eq!(outcome, ReserveOutcome::LimitReached);
        assert_eq!(
            count_rows(&database.pool, "document_extraction_usage").await,
            0
        );
    }

    #[tokio::test]
    async fn given_other_user_at_limit_when_reserve_then_this_user_is_reserved() {
        let (_database, collection) = given_collection().await;
        let other_user = Uuid::new_v4();
        let this_user = Uuid::new_v4();
        collection.reserve(other_user, today(), 1).await.unwrap();

        let outcome = collection
            .reserve(this_user, today(), 1)
            .await
            .expect("reserve");

        assert_eq!(outcome, ReserveOutcome::Reserved { count: 1 });
        assert_eq!(collection.used_today(this_user, today()).await.unwrap(), 1);
        assert_eq!(collection.used_today(other_user, today()).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn given_no_usage_row_when_used_today_then_zero() {
        let (_database, collection) = given_collection().await;

        let used = collection
            .used_today(Uuid::new_v4(), today())
            .await
            .expect("used_today");

        assert_eq!(used, 0);
    }
}
