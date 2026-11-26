use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use crate::domain::{
    health::doctor_visit::{DoctorVisit, DoctorVisitId},
    health::health_member::HealthMemberId,
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

#[cfg(test)]
pub(crate) mod tests {
    use tokio::sync::Mutex;

    use super::*;

    /// In-memory `DoctorVisitRepository` for tests in any layer.
    pub(crate) struct DoctorVisitCollection {
        pub(crate) visits: Mutex<Vec<DoctorVisit>>,
    }

    impl DoctorVisitCollection {
        pub(crate) fn new() -> Self {
            Self {
                visits: Mutex::new(Vec::new()),
            }
        }
    }

    impl Default for DoctorVisitCollection {
        fn default() -> Self {
            Self::new()
        }
    }

    #[async_trait]
    impl DoctorVisitRepository for DoctorVisitCollection {
        async fn get_by_id(&self, id: &DoctorVisitId) -> Option<DoctorVisit> {
            self.visits
                .lock()
                .await
                .iter()
                .find(|v| v.id == *id)
                .cloned()
        }

        async fn list_by_member(
            &self,
            health_member_id: &HealthMemberId,
            user_id: &Uuid,
            from: Option<NaiveDate>,
            to: Option<NaiveDate>,
        ) -> Vec<DoctorVisit> {
            let mut visits: Vec<DoctorVisit> = self
                .visits
                .lock()
                .await
                .iter()
                .filter(|v| v.health_member_id == *health_member_id && v.user_id == *user_id)
                .filter(|v| from.is_none_or(|f| v.visited_on >= f))
                .filter(|v| to.is_none_or(|t| v.visited_on <= t))
                .cloned()
                .collect();
            visits.sort_by(|a, b| {
                b.visited_on
                    .cmp(&a.visited_on)
                    .then_with(|| b.created_at.cmp(&a.created_at))
                    .then_with(|| b.id.0.cmp(&a.id.0))
            });
            visits
        }

        async fn save(
            &self,
            visit: DoctorVisit,
        ) -> Result<DoctorVisit, Box<dyn std::error::Error>> {
            self.visits.lock().await.push(visit.clone());
            Ok(visit)
        }

        async fn update(
            &self,
            visit: DoctorVisit,
        ) -> Result<DoctorVisit, Box<dyn std::error::Error>> {
            let mut visits = self.visits.lock().await;
            let index = visits
                .iter()
                .position(|v| v.id == visit.id)
                .ok_or(MissingDoctorVisit)?;
            visits[index] = visit.clone();
            Ok(visit)
        }

        async fn delete(
            &self,
            id: &DoctorVisitId,
            user_id: &Uuid,
        ) -> Result<(), Box<dyn std::error::Error>> {
            let mut visits = self.visits.lock().await;
            let index = visits
                .iter()
                .position(|v| v.id == *id && v.user_id == *user_id)
                .ok_or(MissingDoctorVisit)?;
            visits.remove(index);
            Ok(())
        }

        async fn load_owned(&self, id: &DoctorVisitId, user_id: &Uuid) -> Option<DoctorVisit> {
            self.visits
                .lock()
                .await
                .iter()
                .find(|v| v.id == *id && v.user_id == *user_id)
                .cloned()
        }
    }
}
