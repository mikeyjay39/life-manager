use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::health_member_repository::HealthMemberRepository,
    domain::health_member::{HealthMember, HealthMemberId},
};

pub struct UpdateHealthMemberCommand {
    member_id: HealthMemberId,
    user_id: Uuid,
    display_name: String,
    birth_date: Option<NaiveDate>,
    notes: Option<String>,
    /// When set, reactivate (`true`) or deactivate (`false`). When `None`, leave active state.
    active: Option<bool>,
    health_member_repository: Arc<dyn HealthMemberRepository>,
}

impl UpdateHealthMemberCommand {
    pub fn new(
        member_id: HealthMemberId,
        user_id: Uuid,
        display_name: String,
        birth_date: Option<NaiveDate>,
        notes: Option<String>,
        active: Option<bool>,
        health_member_repository: Arc<dyn HealthMemberRepository>,
    ) -> Self {
        Self {
            member_id,
            user_id,
            display_name,
            birth_date,
            notes,
            active,
            health_member_repository,
        }
    }

    pub async fn execute(self) -> AppResult<HealthMember> {
        let Some(mut member) = self
            .health_member_repository
            .load_owned(&self.member_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        member.update_profile(
            &self.display_name,
            self.birth_date,
            self.notes.as_deref(),
        )?;

        match self.active {
            Some(true) => member.reactivate(),
            Some(false) => member.deactivate(),
            None => {}
        }

        match self.health_member_repository.update(member).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                tracing::error!("Error updating HealthMember: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
