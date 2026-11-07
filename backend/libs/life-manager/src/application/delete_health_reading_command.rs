use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::health_reading_repository::HealthReadingRepository,
    domain::health_reading::HealthReadingId,
};

/// Hard-deletes an owned HealthReading. Missing or other user's id → NotFound.
pub struct DeleteHealthReadingCommand {
    reading_id: HealthReadingId,
    user_id: Uuid,
    health_reading_repository: Arc<dyn HealthReadingRepository>,
}

impl DeleteHealthReadingCommand {
    pub fn new(
        reading_id: HealthReadingId,
        user_id: Uuid,
        health_reading_repository: Arc<dyn HealthReadingRepository>,
    ) -> Self {
        Self {
            reading_id,
            user_id,
            health_reading_repository,
        }
    }

    pub async fn execute(self) -> AppResult<()> {
        let Some(_reading) = self
            .health_reading_repository
            .load_owned(&self.reading_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        match self
            .health_reading_repository
            .delete(&self.reading_id)
            .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                tracing::error!("Error deleting HealthReading: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
