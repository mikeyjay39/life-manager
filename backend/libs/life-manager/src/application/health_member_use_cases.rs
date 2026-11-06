use std::sync::Arc;

use crate::application::health_member_repository::HealthMemberRepository;

#[derive(Clone)]
pub struct HealthMemberUseCases {
    pub health_member_repository: Arc<dyn HealthMemberRepository>,
}
