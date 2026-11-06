use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::health_member_repository::HealthMemberRepository,
    domain::health_member::HealthMember,
};

pub struct CreateHealthMemberCommand {
    user_id: Uuid,
    display_name: String,
    birth_date: Option<NaiveDate>,
    notes: Option<String>,
    health_member_repository: Arc<dyn HealthMemberRepository>,
}

impl CreateHealthMemberCommand {
    pub fn new(
        user_id: Uuid,
        display_name: String,
        birth_date: Option<NaiveDate>,
        notes: Option<String>,
        health_member_repository: Arc<dyn HealthMemberRepository>,
    ) -> Self {
        Self {
            user_id,
            display_name,
            birth_date,
            notes,
            health_member_repository,
        }
    }

    pub async fn execute(self) -> AppResult<HealthMember> {
        let member = HealthMember::create(
            self.user_id,
            &self.display_name,
            self.birth_date,
            self.notes.as_deref(),
        )?;

        match self.health_member_repository.save(member).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                tracing::error!("Error saving HealthMember: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
