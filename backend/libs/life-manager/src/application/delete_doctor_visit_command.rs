use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::doctor_visit_repository::{DoctorVisitRepository, MissingDoctorVisit},
    domain::doctor_visit::DoctorVisitId,
};

/// Hard-deletes an owned DoctorVisit. Missing or other user's id → NotFound.
///
/// Delete is allowed when the HealthMember is inactive.
pub struct DeleteDoctorVisitCommand {
    visit_id: DoctorVisitId,
    user_id: Uuid,
    doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
}

impl DeleteDoctorVisitCommand {
    pub fn new(
        visit_id: DoctorVisitId,
        user_id: Uuid,
        doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
    ) -> Self {
        Self {
            visit_id,
            user_id,
            doctor_visit_repository,
        }
    }

    pub async fn execute(self) -> AppResult<()> {
        let Some(_visit) = self
            .doctor_visit_repository
            .load_owned(&self.visit_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        match self.doctor_visit_repository.delete(&self.visit_id).await {
            Ok(()) => Ok(()),
            Err(e) => {
                if e.downcast_ref::<MissingDoctorVisit>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error deleting DoctorVisit: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
