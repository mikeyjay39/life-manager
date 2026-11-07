use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::car_repository::{CarRepository, MissingCar},
    domain::car::CarId,
};

/// Hard-deletes an owned Car. Missing or other user's id → NotFound.
pub struct DeleteCarCommand {
    car_id: CarId,
    user_id: Uuid,
    car_repository: Arc<dyn CarRepository>,
}

impl DeleteCarCommand {
    pub fn new(car_id: CarId, user_id: Uuid, car_repository: Arc<dyn CarRepository>) -> Self {
        Self {
            car_id,
            user_id,
            car_repository,
        }
    }

    pub async fn execute(self) -> AppResult<()> {
        let Some(_car) = self
            .car_repository
            .load_owned(&self.car_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        match self.car_repository.delete(&self.car_id).await {
            Ok(()) => Ok(()),
            Err(e) => {
                if e.downcast_ref::<MissingCar>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error deleting Car: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
