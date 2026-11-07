use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::health_member::{HealthMember, HealthMemberId};

/**
 * Port for HealthMember persistence.
 *
 * Ownership: callers that mutate must use `load_owned` so other users see not-found.
 */
#[async_trait]
pub trait HealthMemberRepository: Sync + Send {
    async fn get_by_id(&self, id: &HealthMemberId) -> Option<HealthMember>;

    /// Lists members owned by `user_id`. When `include_inactive` is false, only active rows.
    async fn list_by_owner(&self, user_id: &Uuid, include_inactive: bool) -> Vec<HealthMember>;

    async fn save(&self, member: HealthMember) -> Result<HealthMember, Box<dyn std::error::Error>>;

    async fn update(
        &self,
        member: HealthMember,
    ) -> Result<HealthMember, Box<dyn std::error::Error>>;

    /// Returns the member only when `user_id` owns it.
    async fn load_owned(&self, id: &HealthMemberId, user_id: &Uuid) -> Option<HealthMember>;
}
