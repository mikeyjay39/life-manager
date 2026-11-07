use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        car_maintenance_event_repository::CarMaintenanceEventRepository,
        car_repository::CarRepository,
    },
    domain::{
        car::CarId,
        car_maintenance_event::{CarMaintenanceEvent, CarMaintenanceEventType},
    },
};

pub struct ListCarMaintenanceEventsQuery {
    user_id: Uuid,
    car_id: CarId,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    event_type: Option<CarMaintenanceEventType>,
    car_repository: Arc<dyn CarRepository>,
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
}

impl ListCarMaintenanceEventsQuery {
    pub fn new(
        user_id: Uuid,
        car_id: CarId,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
        event_type: Option<CarMaintenanceEventType>,
        car_repository: Arc<dyn CarRepository>,
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    ) -> Self {
        Self {
            user_id,
            car_id,
            from,
            to,
            event_type,
            car_repository,
            car_maintenance_event_repository,
        }
    }

    pub async fn execute(self) -> AppResult<Vec<CarMaintenanceEvent>> {
        if let (Some(from), Some(to)) = (self.from, self.to)
            && from > to
        {
            return Err(AppError::Validation(
                "from must not be after to".to_string(),
            ));
        }

        self.car_repository
            .load_owned(&self.car_id, &self.user_id)
            .await
            .ok_or(AppError::NotFound)?;

        Ok(self
            .car_maintenance_event_repository
            .list_by_car(
                &self.car_id,
                &self.user_id,
                self.from,
                self.to,
                self.event_type,
            )
            .await)
    }
}
