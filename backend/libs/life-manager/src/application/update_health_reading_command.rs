use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::health_reading_repository::{
        DuplicateHealthReadingDate, HealthReadingRepository, MissingHealthReading,
    },
    domain::health_reading::{HealthReading, HealthReadingId, HealthReadingVitals},
};

/// Updates mutable metric fields on an owned HealthReading.
///
/// `health_member_id` and ownership stay fixed. Duplicate `recorded_on` for
/// another reading on the same member is rejected.
pub struct UpdateHealthReadingCommand {
    reading_id: HealthReadingId,
    user_id: Uuid,
    recorded_on: NaiveDate,
    vitals: HealthReadingVitals,
    health_reading_repository: Arc<dyn HealthReadingRepository>,
}

impl UpdateHealthReadingCommand {
    pub fn new(
        reading_id: HealthReadingId,
        user_id: Uuid,
        recorded_on: NaiveDate,
        vitals: HealthReadingVitals,
        health_reading_repository: Arc<dyn HealthReadingRepository>,
    ) -> Self {
        Self {
            reading_id,
            user_id,
            recorded_on,
            vitals,
            health_reading_repository,
        }
    }

    pub async fn execute(self) -> AppResult<HealthReading> {
        let Some(mut reading) = self
            .health_reading_repository
            .load_owned(&self.reading_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        if let Some(existing) = self
            .health_reading_repository
            .find_by_member_and_date(&reading.health_member_id, self.recorded_on)
            .await
        {
            if existing.id != reading.id {
                return Err(AppError::Validation(
                    "a reading already exists for this HealthMember on this date".to_string(),
                ));
            }
        }

        reading.update(self.recorded_on, self.vitals)?;

        match self.health_reading_repository.update(reading).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<DuplicateHealthReadingDate>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<MissingHealthReading>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error updating HealthReading: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
