use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::car_maintenance_event_repository::{
        CarMaintenanceEventRepository, MissingCarMaintenanceEvent,
    },
    domain::car_maintenance_event::CarMaintenanceEventId,
};

/// Hard-deletes an owned CarMaintenanceEvent. Missing or other user's id → NotFound.
///
/// Delete is allowed when the Car is inactive.
pub struct DeleteCarMaintenanceEventCommand {
    event_id: CarMaintenanceEventId,
    user_id: Uuid,
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
}

impl DeleteCarMaintenanceEventCommand {
    pub fn new(
        event_id: CarMaintenanceEventId,
        user_id: Uuid,
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    ) -> Self {
        Self {
            event_id,
            user_id,
            car_maintenance_event_repository,
        }
    }

    pub async fn execute(self) -> AppResult<()> {
        let Some(_event) = self
            .car_maintenance_event_repository
            .load_owned(&self.event_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        match self
            .car_maintenance_event_repository
            .delete(&self.event_id, &self.user_id)
            .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                if e.downcast_ref::<MissingCarMaintenanceEvent>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error deleting CarMaintenanceEvent: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
