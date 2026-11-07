use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::health_member::HealthMember;

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq, Eq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/HealthMemberDto.ts"
)]
pub struct HealthMemberDto {
    pub id: Uuid,
    pub display_name: String,
    pub birth_date: Option<NaiveDate>,
    pub notes: Option<String>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

impl HealthMemberDto {
    pub fn from_domain(member: &HealthMember) -> Self {
        Self {
            id: member.id.0,
            display_name: member.display_name.clone(),
            birth_date: member.birth_date,
            notes: member.notes.clone(),
            active: member.active,
            created_at: member.created_at,
            updated_at: member.updated_at,
            deactivated_at: member.deactivated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::health_member::HealthMember;
    use uuid::Uuid;

    #[test]
    fn given_domain_member_when_to_dto_then_omits_user_id() {
        let member = HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap();
        let dto = HealthMemberDto::from_domain(&member);
        assert_eq!(dto.id, member.id.0);
        assert_eq!(dto.display_name, "Alex");
        assert!(dto.active);
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn export_typescript_bindings() {
        HealthMemberDto::export().unwrap();
    }
}
