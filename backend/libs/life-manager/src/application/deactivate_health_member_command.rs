use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::health_member_repository::HealthMemberRepository,
    domain::health_member::{HealthMember, HealthMemberId},
};

pub struct DeactivateHealthMemberCommand {
    member_id: HealthMemberId,
    user_id: Uuid,
    health_member_repository: Arc<dyn HealthMemberRepository>,
}

impl DeactivateHealthMemberCommand {
    pub fn new(
        member_id: HealthMemberId,
        user_id: Uuid,
        health_member_repository: Arc<dyn HealthMemberRepository>,
    ) -> Self {
        Self {
            member_id,
            user_id,
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

        member.deactivate();

        match self.health_member_repository.update(member).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                tracing::error!("Error deactivating HealthMember: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
