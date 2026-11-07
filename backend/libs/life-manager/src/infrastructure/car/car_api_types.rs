use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::car::{DISPLAY_NAME_MAX_LEN, MAKE_MODEL_MAX_LEN};

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "CreateCarCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/CreateCarCommand.ts"
)]
pub struct CreateCarCommandDto {
    #[serde(default)]
    pub display_name: Option<String>,
    pub make: String,
    pub model: String,
    pub year: i32,
    #[serde(default)]
    pub vin: Option<String>,
    #[serde(default)]
    pub license_plate: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub insurance_document_id: Option<Uuid>,
    #[serde(default)]
    pub registration_document_id: Option<Uuid>,
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
    rename = "UpdateCarCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/UpdateCarCommand.ts"
)]
pub struct UpdateCarCommandDto {
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub display_name: Option<Option<String>>,
    pub make: String,
    pub model: String,
    pub year: i32,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub vin: Option<Option<String>>,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub license_plate: Option<Option<String>>,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub notes: Option<Option<String>>,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub insurance_document_id: Option<Option<Uuid>>,
    /// Omit to keep; `null` to clear; value to set.
    #[serde(
        default,
        deserialize_with = "deserialize_patch_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional, type = "string | null")]
    pub registration_document_id: Option<Option<Uuid>>,
    /// When set, reactivate (`true`) or deactivate (`false`). Prefer POST .../deactivate to deactivate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active: Option<bool>,
}

#[derive(Deserialize, Debug, Serialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/GetCarsQueryParams.ts"
)]
pub struct GetCarsQueryParams {
    /// When true, include inactive cars. Default false.
    #[serde(default)]
    pub include_inactive: Option<bool>,
}

impl GetCarsQueryParams {
    pub fn include_inactive(&self) -> bool {
        self.include_inactive.unwrap_or(false)
    }
}

/// Documents display_name max length for API consumers (also enforced in domain).
#[allow(dead_code)]
pub const API_DISPLAY_NAME_MAX_LEN: usize = DISPLAY_NAME_MAX_LEN;

/// Documents make/model max length for API consumers (also enforced in domain).
#[allow(dead_code)]
pub const API_MAKE_MODEL_MAX_LEN: usize = MAKE_MODEL_MAX_LEN;

#[cfg(test)]
mod export_ts_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        CreateCarCommandDto::export().unwrap();
        UpdateCarCommandDto::export().unwrap();
        GetCarsQueryParams::export().unwrap();
    }
}

#[cfg(test)]
mod patch_option_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn given_omitted_fields_when_deserialize_then_none_means_keep() {
        let dto: UpdateCarCommandDto = serde_json::from_value(json!({
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020
        }))
        .unwrap();
        assert!(dto.display_name.is_none());
        assert!(dto.vin.is_none());
        assert!(dto.notes.is_none());
        assert!(dto.active.is_none());
    }

    #[test]
    fn given_null_vin_when_deserialize_then_some_none_means_clear() {
        let dto: UpdateCarCommandDto = serde_json::from_value(json!({
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "vin": null
        }))
        .unwrap();
        assert_eq!(dto.vin, Some(None));
    }

    #[test]
    fn given_vin_value_when_deserialize_then_some_some() {
        let dto: UpdateCarCommandDto = serde_json::from_value(json!({
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "vin": "1HGCM82633A004352"
        }))
        .unwrap();
        assert_eq!(dto.vin, Some(Some("1HGCM82633A004352".to_string())));
    }
}
