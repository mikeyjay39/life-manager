use std::sync::Arc;

use crate::application::{
    health_member_repository::HealthMemberRepository,
    health_reading_repository::HealthReadingRepository,
};

#[derive(Clone)]
pub struct HealthReadingUseCases {
    pub health_reading_repository: Arc<dyn HealthReadingRepository>,
    pub health_member_repository: Arc<dyn HealthMemberRepository>,
}
