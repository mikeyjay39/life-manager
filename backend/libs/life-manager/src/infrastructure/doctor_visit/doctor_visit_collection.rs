use async_trait::async_trait;
use chrono::NaiveDate;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    application::doctor_visit_repository::{DoctorVisitRepository, MissingDoctorVisit},
    domain::{
        doctor_visit::{DoctorVisit, DoctorVisitId},
        health_member::HealthMemberId,
    },
};

/// In-memory repository for unit tests.
pub struct DoctorVisitCollection {
    pub visits: Mutex<Vec<DoctorVisit>>,
}

impl DoctorVisitCollection {
    pub fn new() -> Self {
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

    async fn save(&self, visit: DoctorVisit) -> Result<DoctorVisit, Box<dyn std::error::Error>> {
        self.visits.lock().await.push(visit.clone());
        Ok(visit)
    }

    async fn update(&self, visit: DoctorVisit) -> Result<DoctorVisit, Box<dyn std::error::Error>> {
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
