use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::health::health_member::{HealthMember, HealthMemberId};

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

#[cfg(test)]
pub(crate) mod tests {
    use tokio::sync::Mutex;

    use super::*;

    /// In-memory `HealthMemberRepository` for tests in any layer.
    pub(crate) struct HealthMemberCollection {
        pub(crate) members: Mutex<Vec<HealthMember>>,
    }

    impl HealthMemberCollection {
        pub(crate) fn new() -> Self {
            Self {
                members: Mutex::new(Vec::new()),
            }
        }
    }

    impl Default for HealthMemberCollection {
        fn default() -> Self {
            Self::new()
        }
    }

    #[async_trait]
    impl HealthMemberRepository for HealthMemberCollection {
        async fn get_by_id(&self, id: &HealthMemberId) -> Option<HealthMember> {
            self.members
                .lock()
                .await
                .iter()
                .find(|m| m.id == *id)
                .cloned()
        }

        async fn list_by_owner(&self, user_id: &Uuid, include_inactive: bool) -> Vec<HealthMember> {
            let mut members: Vec<HealthMember> = self
                .members
                .lock()
                .await
                .iter()
                .filter(|m| m.user_id == *user_id)
                .filter(|m| include_inactive || m.active)
                .cloned()
                .collect();
            members.sort_by(|a, b| {
                a.display_name
                    .cmp(&b.display_name)
                    .then_with(|| a.id.0.cmp(&b.id.0))
            });
            members
        }

        async fn save(
            &self,
            member: HealthMember,
        ) -> Result<HealthMember, Box<dyn std::error::Error>> {
            self.members.lock().await.push(member.clone());
            Ok(member)
        }

        async fn update(
            &self,
            member: HealthMember,
        ) -> Result<HealthMember, Box<dyn std::error::Error>> {
            let mut members = self.members.lock().await;
            let index = members
                .iter()
                .position(|m| m.id == member.id)
                .ok_or("HealthMember not found")?;
            members[index] = member.clone();
            Ok(member)
        }

        async fn load_owned(&self, id: &HealthMemberId, user_id: &Uuid) -> Option<HealthMember> {
            self.members
                .lock()
                .await
                .iter()
                .find(|m| m.id == *id && m.user_id == *user_id)
                .cloned()
        }
    }
}
