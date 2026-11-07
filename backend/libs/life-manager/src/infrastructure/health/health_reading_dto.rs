use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::health_reading::HealthReading;

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/HealthReadingDto.ts"
)]
pub struct HealthReadingDto {
    pub id: Uuid,
    pub health_member_id: Uuid,
    pub recorded_on: NaiveDate,
    pub height_cm: Option<f64>,
    pub weight_kg: Option<f64>,
    pub systolic_mm_hg: Option<i32>,
    pub diastolic_mm_hg: Option<i32>,
    pub heart_rate_bpm: Option<i32>,
    pub notes: Option<String>,
    /// Derived when height_cm and weight_kg are both set. Not persisted.
    pub bmi: Option<f64>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl HealthReadingDto {
    pub fn from_domain(reading: &HealthReading) -> Self {
        Self {
            id: reading.id.0,
            health_member_id: reading.health_member_id.0,
            recorded_on: reading.recorded_on,
            height_cm: reading.height_cm,
            weight_kg: reading.weight_kg,
            systolic_mm_hg: reading.systolic_mm_hg,
            diastolic_mm_hg: reading.diastolic_mm_hg,
            heart_rate_bpm: reading.heart_rate_bpm,
            notes: reading.notes.clone(),
            bmi: reading.bmi(),
            created_at: reading.created_at,
            updated_at: reading.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        health_member::HealthMember,
        health_reading::{HealthReading, HealthReadingVitals},
    };
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn given_domain_reading_when_to_dto_then_omits_user_id_and_sets_bmi() {
        let member = HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap();
        let reading = HealthReading::create(
            &member,
            Utc::now().date_naive(),
            HealthReadingVitals {
                height_cm: Some(180.0),
                weight_kg: Some(75.0),
                ..Default::default()
            },
        )
        .unwrap();
        let dto = HealthReadingDto::from_domain(&reading);
        assert_eq!(dto.health_member_id, member.id.0);
        assert!(dto.bmi.is_some());
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn export_typescript_bindings() {
        HealthReadingDto::export().unwrap();
    }
}
