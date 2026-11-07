use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::doctor_visit::DoctorVisit;

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/DoctorVisitDto.ts"
)]
pub struct DoctorVisitDto {
    pub id: Uuid,
    pub health_member_id: Uuid,
    pub visited_on: NaiveDate,
    pub provider_name: Option<String>,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl DoctorVisitDto {
    pub fn from_domain(visit: &DoctorVisit) -> Self {
        Self {
            id: visit.id.0,
            health_member_id: visit.health_member_id.0,
            visited_on: visit.visited_on,
            provider_name: visit.provider_name.clone(),
            reason: visit.reason.clone(),
            notes: visit.notes.clone(),
            created_at: visit.created_at,
            updated_at: visit.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::health_member::HealthMember;
    use chrono::Utc;

    #[test]
    fn given_domain_visit_when_to_dto_then_omits_user_id() {
        let member = HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap();
        let visit = DoctorVisit::create(
            &member,
            Utc::now().date_naive(),
            Some("Dr. Lee"),
            Some("Checkup"),
            None,
        )
        .unwrap();
        let dto = DoctorVisitDto::from_domain(&visit);
        assert_eq!(dto.health_member_id, member.id.0);
        assert_eq!(dto.provider_name.as_deref(), Some("Dr. Lee"));
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn export_typescript_bindings() {
        DoctorVisitDto::export().unwrap();
    }
}
