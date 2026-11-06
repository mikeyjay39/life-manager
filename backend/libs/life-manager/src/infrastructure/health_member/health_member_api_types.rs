use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::domain::health_member::DISPLAY_NAME_MAX_LEN;

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "CreateHealthMemberCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/CreateHealthMemberCommand.ts"
)]
pub struct CreateHealthMemberCommandDto {
    pub display_name: String,
    #[serde(default)]
    pub birth_date: Option<NaiveDate>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "UpdateHealthMemberCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/UpdateHealthMemberCommand.ts"
)]
pub struct UpdateHealthMemberCommandDto {
    pub display_name: String,
    #[serde(default)]
    pub birth_date: Option<NaiveDate>,
    #[serde(default)]
    pub notes: Option<String>,
    /// When set, reactivate (`true`) or deactivate (`false`). Prefer POST .../deactivate to deactivate.
    #[serde(default)]
    pub active: Option<bool>,
}

#[derive(Deserialize, Debug, Serialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/GetHealthMembersQueryParams.ts"
)]
pub struct GetHealthMembersQueryParams {
    /// When true, include inactive members. Default false.
    #[serde(default)]
    pub include_inactive: Option<bool>,
}

impl GetHealthMembersQueryParams {
    pub fn include_inactive(&self) -> bool {
        self.include_inactive.unwrap_or(false)
    }
}

/// Documents the display_name max length for API consumers (also enforced in domain).
#[allow(dead_code)]
pub const API_DISPLAY_NAME_MAX_LEN: usize = DISPLAY_NAME_MAX_LEN;

#[cfg(test)]
mod export_ts_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        CreateHealthMemberCommandDto::export().unwrap();
        UpdateHealthMemberCommandDto::export().unwrap();
        GetHealthMembersQueryParams::export().unwrap();
    }
}
