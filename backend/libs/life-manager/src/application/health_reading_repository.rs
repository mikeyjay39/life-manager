use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use crate::domain::{
    health_member::HealthMemberId,
    health_reading::{HealthReading, HealthReadingId},
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
