use std::sync::Arc;

use backend_utils::{AppError, app_result::AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::application::document::extraction_limits::{ExtractionLimits, ExtractionLimitsReader};
use crate::application::document::extraction_usage::ExtractionUsage;

const NOT_CONFIGURED_MESSAGE: &str = "Extraction is not configured";

/// The owner-set limits and the units the user has left for the UTC date.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExtractionLimitsView {
    pub limits: ExtractionLimits,
    pub remaining_today: u32,
}

/// Loads the limits row. A missing row is a configuration fault, so it gives
/// 503 and an error log line instead of a default limit.
///
/// Shared by `GetExtractionLimitsQuery` and the extract command (gh-321).
pub async fn load_configured_limits(
    reader: &dyn ExtractionLimitsReader,
) -> AppResult<ExtractionLimits> {
    match reader.load().await {
        Ok(Some(limits)) => Ok(limits),
        Ok(None) => {
            tracing::error!("document_extraction_limits row is missing");
            Err(AppError::ServiceUnavailable(
                NOT_CONFIGURED_MESSAGE.to_string(),
            ))
        }
        Err(err) => {
            tracing::error!("Failed to load document extraction limits: {err:?}");
            Err(AppError::Internal(err))
        }
    }
}

pub struct GetExtractionLimitsQuery {
    limits_reader: Arc<dyn ExtractionLimitsReader>,
    usage: Arc<dyn ExtractionUsage>,
    user_id: Uuid,
    today: NaiveDate,
}

impl GetExtractionLimitsQuery {
    pub fn new(
        limits_reader: Arc<dyn ExtractionLimitsReader>,
        usage: Arc<dyn ExtractionUsage>,
        user_id: Uuid,
        today: NaiveDate,
    ) -> Self {
        Self {
            limits_reader,
            usage,
            user_id,
            today,
        }
    }

    pub async fn execute(self) -> AppResult<ExtractionLimitsView> {
        let limits = load_configured_limits(self.limits_reader.as_ref()).await?;
        let used_today = self
            .usage
            .used_today(self.user_id, self.today)
            .await
            .map_err(|err| {
                tracing::error!("Failed to read document extraction usage: {err:?}");
                AppError::Internal(err)
            })?;
        // The owner can lower the limit below today's count; never go negative.
        let remaining_today = limits.daily_limit_per_user.saturating_sub(used_today);
        Ok(ExtractionLimitsView {
            limits,
            remaining_today,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::application::document::extraction_limits::tests::{
        FixedExtractionLimits, SEEDED_LIMITS,
    };
    use crate::application::document::extraction_usage::tests::InMemoryExtractionUsage;

    use super::*;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 26).expect("valid date")
    }

    async fn use_units(usage: &InMemoryExtractionUsage, user_id: Uuid, units: u32) {
        for _ in 0..units {
            usage
                .reserve(user_id, today(), u32::MAX)
                .await
                .expect("reserve");
        }
    }

    async fn run_query(
        limits: Option<ExtractionLimits>,
        usage: Arc<InMemoryExtractionUsage>,
        user_id: Uuid,
    ) -> AppResult<ExtractionLimitsView> {
        GetExtractionLimitsQuery::new(
            Arc::new(FixedExtractionLimits(limits)),
            usage,
            user_id,
            today(),
        )
        .execute()
        .await
    }

    #[tokio::test]
    async fn given_seeded_limits_and_no_usage_when_execute_then_remaining_is_20() {
        let view = run_query(
            Some(SEEDED_LIMITS),
            Arc::new(InMemoryExtractionUsage::new()),
            Uuid::new_v4(),
        )
        .await
        .expect("view");

        assert_eq!(view.limits, SEEDED_LIMITS);
        assert_eq!(view.remaining_today, 20);
    }

    #[tokio::test]
    async fn given_2_of_20_used_when_execute_then_remaining_is_18() {
        let usage = Arc::new(InMemoryExtractionUsage::new());
        let user_id = Uuid::new_v4();
        use_units(&usage, user_id, 2).await;

        let view = run_query(Some(SEEDED_LIMITS), usage, user_id)
            .await
            .expect("view");

        assert_eq!(view.remaining_today, 18);
    }

    #[tokio::test]
    async fn given_limit_lowered_below_count_when_execute_then_remaining_is_0() {
        let usage = Arc::new(InMemoryExtractionUsage::new());
        let user_id = Uuid::new_v4();
        use_units(&usage, user_id, 5).await;
        let lowered = ExtractionLimits {
            daily_limit_per_user: 3,
            ..SEEDED_LIMITS
        };

        let view = run_query(Some(lowered), usage, user_id)
            .await
            .expect("view");

        assert_eq!(view.limits.daily_limit_per_user, 3);
        assert_eq!(view.remaining_today, 0);
    }

    #[tokio::test]
    async fn given_other_user_usage_when_execute_then_remaining_is_unchanged() {
        let usage = Arc::new(InMemoryExtractionUsage::new());
        use_units(&usage, Uuid::new_v4(), 7).await;

        let view = run_query(Some(SEEDED_LIMITS), usage, Uuid::new_v4())
            .await
            .expect("view");

        assert_eq!(view.remaining_today, 20);
    }

    #[tokio::test]
    async fn given_missing_limits_row_when_execute_then_service_unavailable() {
        let result = run_query(
            None,
            Arc::new(InMemoryExtractionUsage::new()),
            Uuid::new_v4(),
        )
        .await;

        match result {
            Err(AppError::ServiceUnavailable(message)) => {
                assert_eq!(message, "Extraction is not configured");
            }
            other => panic!("expected ServiceUnavailable, got {other:?}"),
        }
    }
}
