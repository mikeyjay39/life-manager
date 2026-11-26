use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use crate::domain::{
    health::health_member::HealthMemberId,
    health::health_reading::{HealthReading, HealthReadingId},
};

/// Unique `(health_member_id, recorded_on)` conflict on insert.
#[derive(Debug)]
pub struct DuplicateHealthReadingDate;

impl std::fmt::Display for DuplicateHealthReadingDate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "a reading already exists for this HealthMember on this date"
        )
    }
}

impl std::error::Error for DuplicateHealthReadingDate {}

/// Insert rejected because the HealthMember row is gone.
#[derive(Debug)]
pub struct MissingHealthMemberForReading;

impl std::fmt::Display for MissingHealthMemberForReading {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HealthMember not found for reading save")
    }
}

impl std::error::Error for MissingHealthMemberForReading {}

/// Insert rejected because the HealthMember is inactive.
#[derive(Debug)]
pub struct InactiveHealthMemberForReading;

impl std::fmt::Display for InactiveHealthMemberForReading {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "HealthMember is inactive; reactivate before creating new readings or visits"
        )
    }
}

impl std::error::Error for InactiveHealthMemberForReading {}

/// Update or delete affected 0 rows (row removed after load).
#[derive(Debug)]
pub struct MissingHealthReading;

impl std::fmt::Display for MissingHealthReading {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HealthReading not found")
    }
}

impl std::error::Error for MissingHealthReading {}

/**
 * Port for HealthReading persistence.
 *
 * Unique key is `(health_member_id, recorded_on)`. Callers that mutate must
 * use `load_owned` so other users see not-found.
 */
#[async_trait]
pub trait HealthReadingRepository: Sync + Send {
    async fn get_by_id(&self, id: &HealthReadingId) -> Option<HealthReading>;

    /// Lists readings for one HealthMember owned by `user_id`, newest first.
    /// Optional `from` / `to` filter on `recorded_on` (inclusive).
    async fn list_by_member(
        &self,
        health_member_id: &HealthMemberId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
    ) -> Vec<HealthReading>;

    async fn find_by_member_and_date(
        &self,
        health_member_id: &HealthMemberId,
        recorded_on: NaiveDate,
    ) -> Option<HealthReading>;

    async fn save(
        &self,
        reading: HealthReading,
    ) -> Result<HealthReading, Box<dyn std::error::Error>>;

    async fn update(
        &self,
        reading: HealthReading,
    ) -> Result<HealthReading, Box<dyn std::error::Error>>;

    async fn delete(&self, id: &HealthReadingId) -> Result<(), Box<dyn std::error::Error>>;

    /// Returns the reading only when `user_id` owns it.
    async fn load_owned(&self, id: &HealthReadingId, user_id: &Uuid) -> Option<HealthReading>;
}

#[cfg(test)]
pub(crate) mod tests {
    use tokio::sync::Mutex;

    use super::*;

    /// In-memory `HealthReadingRepository` for tests in any layer.
    pub(crate) struct HealthReadingCollection {
        pub(crate) readings: Mutex<Vec<HealthReading>>,
    }

    impl HealthReadingCollection {
        pub(crate) fn new() -> Self {
            Self {
                readings: Mutex::new(Vec::new()),
            }
        }
    }

    impl Default for HealthReadingCollection {
        fn default() -> Self {
            Self::new()
        }
    }

    #[async_trait]
    impl HealthReadingRepository for HealthReadingCollection {
        async fn get_by_id(&self, id: &HealthReadingId) -> Option<HealthReading> {
            self.readings
                .lock()
                .await
                .iter()
                .find(|r| r.id == *id)
                .cloned()
        }

        async fn list_by_member(
            &self,
            health_member_id: &HealthMemberId,
            user_id: &Uuid,
            from: Option<NaiveDate>,
            to: Option<NaiveDate>,
        ) -> Vec<HealthReading> {
            let mut readings: Vec<HealthReading> = self
                .readings
                .lock()
                .await
                .iter()
                .filter(|r| r.health_member_id == *health_member_id && r.user_id == *user_id)
                .filter(|r| from.is_none_or(|f| r.recorded_on >= f))
                .filter(|r| to.is_none_or(|t| r.recorded_on <= t))
                .cloned()
                .collect();
            readings.sort_by(|a, b| {
                b.recorded_on
                    .cmp(&a.recorded_on)
                    .then_with(|| b.id.0.cmp(&a.id.0))
            });
            readings
        }

        async fn find_by_member_and_date(
            &self,
            health_member_id: &HealthMemberId,
            recorded_on: NaiveDate,
        ) -> Option<HealthReading> {
            self.readings
                .lock()
                .await
                .iter()
                .find(|r| r.health_member_id == *health_member_id && r.recorded_on == recorded_on)
                .cloned()
        }

        async fn save(
            &self,
            reading: HealthReading,
        ) -> Result<HealthReading, Box<dyn std::error::Error>> {
            let mut readings = self.readings.lock().await;
            if readings.iter().any(|r| {
                r.health_member_id == reading.health_member_id
                    && r.recorded_on == reading.recorded_on
            }) {
                return Err(Box::new(DuplicateHealthReadingDate));
            }
            readings.push(reading.clone());
            Ok(reading)
        }

        async fn update(
            &self,
            reading: HealthReading,
        ) -> Result<HealthReading, Box<dyn std::error::Error>> {
            let mut readings = self.readings.lock().await;
            if readings.iter().any(|r| {
                r.id != reading.id
                    && r.health_member_id == reading.health_member_id
                    && r.recorded_on == reading.recorded_on
            }) {
                return Err(Box::new(DuplicateHealthReadingDate));
            }
            let index = readings
                .iter()
                .position(|r| r.id == reading.id)
                .ok_or(MissingHealthReading)?;
            readings[index] = reading.clone();
            Ok(reading)
        }

        async fn delete(&self, id: &HealthReadingId) -> Result<(), Box<dyn std::error::Error>> {
            let mut readings = self.readings.lock().await;
            let index = readings
                .iter()
                .position(|r| r.id == *id)
                .ok_or(MissingHealthReading)?;
            readings.remove(index);
            Ok(())
        }

        async fn load_owned(&self, id: &HealthReadingId, user_id: &Uuid) -> Option<HealthReading> {
            self.readings
                .lock()
                .await
                .iter()
                .find(|r| r.id == *id && r.user_id == *user_id)
                .cloned()
        }
    }
}
