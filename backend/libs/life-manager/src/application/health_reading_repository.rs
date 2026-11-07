use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use crate::domain::{
    health_member::HealthMemberId,
    health_reading::{HealthReading, HealthReadingId},
};

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
