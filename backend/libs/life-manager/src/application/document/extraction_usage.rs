use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

/// Result of one attempt to take a daily extraction unit.
#[derive(Debug, PartialEq, Eq)]
pub enum ReserveOutcome {
    /// The unit is taken. `count` is the user's usage for the date after the reserve.
    Reserved {
        count: u32,
    },
    LimitReached,
}

/// Per-user count of extraction units, one counter for each UTC date.
#[async_trait]
pub trait ExtractionUsage: Send + Sync {
    /// Takes one unit when the user's count for `today` is less than `limit`.
    /// The check and the increment are one atomic step.
    async fn reserve(
        &self,
        user_id: Uuid,
        today: NaiveDate,
        limit: u32,
    ) -> anyhow::Result<ReserveOutcome>;

    async fn used_today(&self, user_id: Uuid, today: NaiveDate) -> anyhow::Result<u32>;
}

#[cfg(test)]
pub(crate) mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;

    /// In-memory `ExtractionUsage` for tests in any layer.
    #[derive(Default)]
    pub(crate) struct InMemoryExtractionUsage {
        counts: Mutex<HashMap<(Uuid, NaiveDate), u32>>,
    }

    impl InMemoryExtractionUsage {
        pub(crate) fn new() -> Self {
            Self::default()
        }
    }

    #[async_trait]
    impl ExtractionUsage for InMemoryExtractionUsage {
        async fn reserve(
            &self,
            user_id: Uuid,
            today: NaiveDate,
            limit: u32,
        ) -> anyhow::Result<ReserveOutcome> {
            let mut counts = self
                .counts
                .lock()
                .map_err(|_| anyhow::anyhow!("usage lock poisoned"))?;
            let used = counts.get(&(user_id, today)).copied().unwrap_or(0);
            if used >= limit {
                return Ok(ReserveOutcome::LimitReached);
            }
            counts.insert((user_id, today), used + 1);
            Ok(ReserveOutcome::Reserved { count: used + 1 })
        }

        async fn used_today(&self, user_id: Uuid, today: NaiveDate) -> anyhow::Result<u32> {
            let counts = self
                .counts
                .lock()
                .map_err(|_| anyhow::anyhow!("usage lock poisoned"))?;
            Ok(counts.get(&(user_id, today)).copied().unwrap_or(0))
        }
    }
}
