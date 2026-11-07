use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::application::create_doctor_visit_command::DoctorVisitText;

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "CreateDoctorVisitCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/CreateDoctorVisitCommand.ts"
)]
pub struct CreateDoctorVisitCommandDto {
    pub health_member_id: Uuid,
    pub visited_on: NaiveDate,
    #[serde(default)]
    pub provider_name: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl CreateDoctorVisitCommandDto {
    pub fn into_text(self) -> DoctorVisitText {
        DoctorVisitText {
            provider_name: self.provider_name,
            reason: self.reason,
            notes: self.notes,
        }
    }
}

/// Replaces mutable fields on a DoctorVisit. `health_member_id` is immutable.
#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "UpdateDoctorVisitCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/UpdateDoctorVisitCommand.ts"
)]
pub struct UpdateDoctorVisitCommandDto {
    pub visited_on: NaiveDate,
    #[serde(default)]
    pub provider_name: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl UpdateDoctorVisitCommandDto {
    pub fn into_text(self) -> DoctorVisitText {
        DoctorVisitText {
            provider_name: self.provider_name,
            reason: self.reason,
            notes: self.notes,
        }
    }
}

#[derive(Deserialize, Debug, Serialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/GetDoctorVisitsQueryParams.ts"
)]
pub struct GetDoctorVisitsQueryParams {
    pub health_member_id: Option<Uuid>,
    #[serde(default)]
    pub from: Option<NaiveDate>,
    #[serde(default)]
    pub to: Option<NaiveDate>,
}

#[cfg(test)]
mod export_ts_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        CreateDoctorVisitCommandDto::export().unwrap();
        UpdateDoctorVisitCommandDto::export().unwrap();
        GetDoctorVisitsQueryParams::export().unwrap();
    }
}
