use std::sync::Arc;

use uuid::Uuid;

use crate::{application::car_repository::CarRepository, domain::car::Car};

pub struct ListCarsQuery {
    user_id: Uuid,
    include_inactive: bool,
    car_repository: Arc<dyn CarRepository>,
}

impl ListCarsQuery {
    pub fn new(
        user_id: Uuid,
        include_inactive: bool,
        car_repository: Arc<dyn CarRepository>,
    ) -> Self {
        Self {
            user_id,
            include_inactive,
            car_repository,
        }
    }

    pub async fn execute(self) -> Vec<Car> {
        self.car_repository
            .list_by_owner(&self.user_id, self.include_inactive)
            .await
    }
}
