use async_trait::async_trait;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    application::health_member_repository::HealthMemberRepository,
    domain::health_member::{HealthMember, HealthMemberId},
};

pub struct HealthMemberCollection {
    pub members: Mutex<Vec<HealthMember>>,
}

impl HealthMemberCollection {
    pub fn new() -> Self {
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

    async fn save(&self, member: HealthMember) -> Result<HealthMember, Box<dyn std::error::Error>> {
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
