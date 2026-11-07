use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::car_repository::CarRepository,
    domain::car::{Car, CarId},
};

pub struct DeactivateCarCommand {
    car_id: CarId,
    user_id: Uuid,
    car_repository: Arc<dyn CarRepository>,
}

impl DeactivateCarCommand {
    pub fn new(car_id: CarId, user_id: Uuid, car_repository: Arc<dyn CarRepository>) -> Self {
        Self {
            car_id,
            user_id,
            car_repository,
        }
    }

    pub async fn execute(self) -> AppResult<Car> {
        let Some(mut car) = self
            .car_repository
            .load_owned(&self.car_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        car.deactivate();

        match self.car_repository.update(car).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                tracing::error!("Error deactivating Car: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
