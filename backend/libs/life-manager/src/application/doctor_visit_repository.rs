use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use crate::domain::{
    doctor_visit::{DoctorVisit, DoctorVisitId},
    health_member::HealthMemberId,
};

/// Write rejected because the HealthMember row is gone.
#[derive(Debug)]
pub struct MissingHealthMemberForVisit;

impl std::fmt::Display for MissingHealthMemberForVisit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HealthMember not found for doctor visit save")
    }
}

impl std::error::Error for MissingHealthMemberForVisit {}

/// Write rejected because the HealthMember is inactive.
#[derive(Debug)]
pub struct InactiveHealthMemberForVisit;

impl std::fmt::Display for InactiveHealthMemberForVisit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "HealthMember is inactive; reactivate before creating new readings or visits"
        )
    }
}

impl std::error::Error for InactiveHealthMemberForVisit {}

/// Update or delete affected 0 rows (row removed after load).
#[derive(Debug)]
pub struct MissingDoctorVisit;

impl std::fmt::Display for MissingDoctorVisit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "DoctorVisit not found")
    }
}

impl std::error::Error for MissingDoctorVisit {}

/**
 * Port for DoctorVisit persistence.
 *
 * Many visits on the same date are allowed. There is no unique date key.
 * Callers that mutate must use `load_owned` so other users see not-found.
 */
#[async_trait]
pub trait DoctorVisitRepository: Sync + Send {
    async fn get_by_id(&self, id: &DoctorVisitId) -> Option<DoctorVisit>;

    /// Lists visits for one HealthMember owned by `user_id`, newest first.
    /// Optional `from` / `to` filter on `visited_on` (inclusive).
    async fn list_by_member(
        &self,
        health_member_id: &HealthMemberId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
    ) -> Vec<DoctorVisit>;

    async fn save(&self, visit: DoctorVisit) -> Result<DoctorVisit, Box<dyn std::error::Error>>;

    async fn update(&self, visit: DoctorVisit) -> Result<DoctorVisit, Box<dyn std::error::Error>>;

    /// Deletes by id only when `user_id` owns the row.
    async fn delete(
        &self,
        id: &DoctorVisitId,
        user_id: &Uuid,
    ) -> Result<(), Box<dyn std::error::Error>>;

    /// Returns the visit only when `user_id` owns it.
    async fn load_owned(&self, id: &DoctorVisitId, user_id: &Uuid) -> Option<DoctorVisit>;
}
