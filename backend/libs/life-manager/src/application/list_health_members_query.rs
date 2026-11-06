use std::sync::Arc;

use uuid::Uuid;

use crate::{
    application::health_member_repository::HealthMemberRepository,
    domain::health_member::HealthMember,
};

pub struct ListHealthMembersQuery {
    user_id: Uuid,
    include_inactive: bool,
    health_member_repository: Arc<dyn HealthMemberRepository>,
}

impl ListHealthMembersQuery {
    pub fn new(
        user_id: Uuid,
        include_inactive: bool,
        health_member_repository: Arc<dyn HealthMemberRepository>,
    ) -> Self {
        Self {
            user_id,
            include_inactive,
            health_member_repository,
        }
    }

    pub async fn execute(self) -> Vec<HealthMember> {
        self.health_member_repository
            .list_by_owner(&self.user_id, self.include_inactive)
            .await
    }
}
