use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        create_doctor_visit_command::DoctorVisitText,
        doctor_visit_repository::{
            DoctorVisitRepository, InactiveHealthMemberForVisit, MissingDoctorVisit,
            MissingHealthMemberForVisit,
        },
        health_member_repository::HealthMemberRepository,
    },
    domain::doctor_visit::{DoctorVisit, DoctorVisitId},
};

/// Updates mutable fields on an owned DoctorVisit.
///
/// `health_member_id` and ownership stay fixed. The command also loads the
/// owned HealthMember for the visit. An inactive or missing member rejects the
/// update.
pub struct UpdateDoctorVisitCommand {
    visit_id: DoctorVisitId,
    user_id: Uuid,
    visited_on: NaiveDate,
    text: DoctorVisitText,
    health_member_repository: Arc<dyn HealthMemberRepository>,
    doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
}

impl UpdateDoctorVisitCommand {
    pub fn new(
        visit_id: DoctorVisitId,
        user_id: Uuid,
        visited_on: NaiveDate,
        text: DoctorVisitText,
        health_member_repository: Arc<dyn HealthMemberRepository>,
        doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
    ) -> Self {
        Self {
            visit_id,
            user_id,
            visited_on,
            text,
            health_member_repository,
            doctor_visit_repository,
        }
    }

    pub async fn execute(self) -> AppResult<DoctorVisit> {
        let Some(mut visit) = self
            .doctor_visit_repository
            .load_owned(&self.visit_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        let member = self
            .health_member_repository
            .load_owned(&visit.health_member_id, &self.user_id)
            .await
            .ok_or(AppError::NotFound)?;
        member.ensure_active_for_write()?;

        visit.update(
            self.visited_on,
            self.text.provider_name.as_deref(),
            self.text.reason.as_deref(),
            self.text.notes.as_deref(),
        )?;

        match self.doctor_visit_repository.update(visit).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<InactiveHealthMemberForVisit>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<MissingHealthMemberForVisit>().is_some()
                    || e.downcast_ref::<MissingDoctorVisit>().is_some()
                {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error updating DoctorVisit: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
