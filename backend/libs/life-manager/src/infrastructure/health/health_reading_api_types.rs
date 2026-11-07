use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::health_reading::HealthReadingVitals;

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "CreateHealthReadingCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/CreateHealthReadingCommand.ts"
)]
pub struct CreateHealthReadingCommandDto {
    pub health_member_id: Uuid,
    pub recorded_on: NaiveDate,
    #[serde(default)]
    pub height_cm: Option<f64>,
    #[serde(default)]
    pub weight_kg: Option<f64>,
    #[serde(default)]
    pub systolic_mm_hg: Option<i32>,
    #[serde(default)]
    pub diastolic_mm_hg: Option<i32>,
    #[serde(default)]
    pub heart_rate_bpm: Option<i32>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl CreateHealthReadingCommandDto {
    pub fn into_vitals(self) -> HealthReadingVitals {
        HealthReadingVitals {
            height_cm: self.height_cm,
            weight_kg: self.weight_kg,
            systolic_mm_hg: self.systolic_mm_hg,
            diastolic_mm_hg: self.diastolic_mm_hg,
            heart_rate_bpm: self.heart_rate_bpm,
            notes: self.notes,
        }
    }
}

/// Replaces mutable metric fields on a HealthReading. `health_member_id` is immutable.
#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "UpdateHealthReadingCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/UpdateHealthReadingCommand.ts"
)]
pub struct UpdateHealthReadingCommandDto {
    pub recorded_on: NaiveDate,
    #[serde(default)]
    pub height_cm: Option<f64>,
    #[serde(default)]
    pub weight_kg: Option<f64>,
    #[serde(default)]
    pub systolic_mm_hg: Option<i32>,
    #[serde(default)]
    pub diastolic_mm_hg: Option<i32>,
    #[serde(default)]
    pub heart_rate_bpm: Option<i32>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl UpdateHealthReadingCommandDto {
    pub fn into_vitals(self) -> HealthReadingVitals {
        HealthReadingVitals {
            height_cm: self.height_cm,
            weight_kg: self.weight_kg,
            systolic_mm_hg: self.systolic_mm_hg,
            diastolic_mm_hg: self.diastolic_mm_hg,
            heart_rate_bpm: self.heart_rate_bpm,
            notes: self.notes,
        }
    }
}

#[derive(Deserialize, Debug, Serialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/GetHealthReadingsQueryParams.ts"
)]
pub struct GetHealthReadingsQueryParams {
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
        CreateHealthReadingCommandDto::export().unwrap();
        UpdateHealthReadingCommandDto::export().unwrap();
        GetHealthReadingsQueryParams::export().unwrap();
    }
}
