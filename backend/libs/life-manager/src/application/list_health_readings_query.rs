use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        health_member_repository::HealthMemberRepository,
        health_reading_repository::HealthReadingRepository,
    },
    domain::{health_member::HealthMemberId, health_reading::HealthReading},
};

pub struct ListHealthReadingsQuery {
    user_id: Uuid,
    health_member_id: HealthMemberId,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    health_member_repository: Arc<dyn HealthMemberRepository>,
    health_reading_repository: Arc<dyn HealthReadingRepository>,
}

impl ListHealthReadingsQuery {
    pub fn new(
        user_id: Uuid,
        health_member_id: HealthMemberId,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
        health_member_repository: Arc<dyn HealthMemberRepository>,
        health_reading_repository: Arc<dyn HealthReadingRepository>,
    ) -> Self {
        Self {
            user_id,
            health_member_id,
            from,
            to,
            health_member_repository,
            health_reading_repository,
        }
    }

    pub async fn execute(self) -> AppResult<Vec<HealthReading>> {
        if let (Some(from), Some(to)) = (self.from, self.to)
            && from > to
        {
            return Err(AppError::Validation(
                "from must not be after to".to_string(),
            ));
        }

        self.health_member_repository
            .load_owned(&self.health_member_id, &self.user_id)
            .await
            .ok_or(AppError::NotFound)?;

        Ok(self
            .health_reading_repository
            .list_by_member(
                &self.health_member_id,
                &self.user_id,
                self.from,
                self.to,
            )
            .await)
    }
}
