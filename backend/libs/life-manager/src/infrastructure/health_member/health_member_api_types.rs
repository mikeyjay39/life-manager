use chrono::NaiveDate;
use serde::{Deserialize, Deserializer, Serialize};
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

/// Present-or-absent optional field for PATCH-style PUT bodies.
/// - JSON omit → `None` (keep stored value)
/// - JSON `null` → `Some(None)` (clear)
/// - JSON value → `Some(Some(v))` (set)
fn deserialize_patch_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "UpdateHealthMemberCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/UpdateHealthMemberCommand.ts"
)]
pub struct UpdateHealthMemberCommandDto {
    pub display_name: String,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub birth_date: Option<Option<NaiveDate>>,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub notes: Option<Option<String>>,
    /// When set, reactivate (`true`) or deactivate (`false`). Prefer POST .../deactivate to deactivate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
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

#[cfg(test)]
mod patch_option_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn given_omitted_fields_when_deserialize_then_none_means_keep() {
        let dto: UpdateHealthMemberCommandDto = serde_json::from_value(json!({
            "display_name": "Alex"
        }))
        .unwrap();
        assert!(dto.birth_date.is_none());
        assert!(dto.notes.is_none());
        assert!(dto.active.is_none());
    }

    #[test]
    fn given_null_notes_when_deserialize_then_some_none_means_clear() {
        let dto: UpdateHealthMemberCommandDto = serde_json::from_value(json!({
            "display_name": "Alex",
            "notes": null
        }))
        .unwrap();
        assert_eq!(dto.notes, Some(None));
    }

    #[test]
    fn given_notes_value_when_deserialize_then_some_some() {
        let dto: UpdateHealthMemberCommandDto = serde_json::from_value(json!({
            "display_name": "Alex",
            "notes": "hi"
        }))
        .unwrap();
        assert_eq!(dto.notes, Some(Some("hi".to_string())));
    }
}
