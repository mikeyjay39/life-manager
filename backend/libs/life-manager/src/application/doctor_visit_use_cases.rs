use std::sync::Arc;

use crate::application::{
    doctor_visit_repository::DoctorVisitRepository,
    health_member_repository::HealthMemberRepository,
};

#[derive(Clone)]
pub struct DoctorVisitUseCases {
    pub doctor_visit_repository: Arc<dyn DoctorVisitRepository>,
    pub health_member_repository: Arc<dyn HealthMemberRepository>,
}
