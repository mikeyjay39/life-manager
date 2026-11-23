use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        health::doctor_visit_repository::DoctorVisitRepository,
        health::health_member_repository::HealthMemberRepository,
    },
    domain::{health::doctor_visit::DoctorVisit, health::health_member::HealthMemberId},
};

pub struct ListDoctorVisitsQuery {
    user_id: Uuid,
    health_member_id: HealthMemberId,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    health_member_repository: Arc<dyn HealthMemberRepository>,
    doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
}

impl ListDoctorVisitsQuery {
    pub fn new(
        user_id: Uuid,
        health_member_id: HealthMemberId,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
        health_member_repository: Arc<dyn HealthMemberRepository>,
        doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
    ) -> Self {
        Self {
            user_id,
            health_member_id,
            from,
            to,
            health_member_repository,
            doctor_visit_repository,
        }
    }

    pub async fn execute(self) -> AppResult<Vec<DoctorVisit>> {
        if let (Some(from), Some(to)) = (self.from, self.to)
            && from > to
        {
            return Err(AppError::Validation(
                "from must not be after to".to_string(),
            ));
        }

        self.health_member_repository
            .load_owned(&self.health_member_id, &self.user_id)
            .await
            .ok_or(AppError::NotFound)?;

        Ok(self
            .doctor_visit_repository
            .list_by_member(&self.health_member_id, &self.user_id, self.from, self.to)
            .await)
    }
}
