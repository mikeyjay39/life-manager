use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        health_member_repository::HealthMemberRepository,
        health_reading_repository::{
            DuplicateHealthReadingDate, HealthReadingRepository, InactiveHealthMemberForReading,
            MissingHealthMemberForReading,
        },
    },
    domain::{
        health_member::HealthMemberId,
        health_reading::{HealthReading, HealthReadingVitals},
    },
};

pub struct CreateHealthReadingCommand {
    user_id: Uuid,
    health_member_id: HealthMemberId,
    recorded_on: NaiveDate,
    vitals: HealthReadingVitals,
    health_member_repository: Arc<dyn HealthMemberRepository>,
    health_reading_repository: Arc<dyn HealthReadingRepository>,
}

impl CreateHealthReadingCommand {
    pub fn new(
        user_id: Uuid,
        health_member_id: HealthMemberId,
        recorded_on: NaiveDate,
        vitals: HealthReadingVitals,
        health_member_repository: Arc<dyn HealthMemberRepository>,
        health_reading_repository: Arc<dyn HealthReadingRepository>,
    ) -> Self {
        Self {
            user_id,
            health_member_id,
            recorded_on,
            vitals,
            health_member_repository,
            health_reading_repository,
        }
    }

    pub async fn execute(self) -> AppResult<HealthReading> {
        let member = self
            .health_member_repository
            .load_owned(&self.health_member_id, &self.user_id)
            .await
            .ok_or(AppError::NotFound)?;

        if self
            .health_reading_repository
            .find_by_member_and_date(&self.health_member_id, self.recorded_on)
            .await
            .is_some()
        {
            return Err(AppError::Validation(
                "a reading already exists for this HealthMember on this date".to_string(),
            ));
        }

        let reading = HealthReading::create(&member, self.recorded_on, self.vitals)?;

        match self.health_reading_repository.save(reading).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<DuplicateHealthReadingDate>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<InactiveHealthMemberForReading>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<MissingHealthMemberForReading>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error saving HealthReading: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
