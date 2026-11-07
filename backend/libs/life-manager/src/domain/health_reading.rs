use backend_utils::AppError;
use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::health_member::{HealthMember, HealthMemberId, NOTES_MAX_LEN};

/// Stable identity of a HealthReading aggregate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct HealthReadingId(pub Uuid);

impl HealthReadingId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl Default for HealthReadingId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for HealthReadingId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl From<HealthReadingId> for Uuid {
    fn from(value: HealthReadingId) -> Self {
        value.0
    }
}

impl std::fmt::Display for HealthReadingId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Optional vital fields for create and update.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HealthReadingVitals {
    pub height_cm: Option<f64>,
    pub weight_kg: Option<f64>,
    pub systolic_mm_hg: Option<i32>,
    pub diastolic_mm_hg: Option<i32>,
    pub heart_rate_bpm: Option<i32>,
    pub notes: Option<String>,
}

/// One dated measurement event for one HealthMember. Separate from Document.
///
/// BMI is derived via [`HealthReading::bmi`] when height and weight are both set.
/// Store metric units only. Do not store BMI.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct HealthReading {
    pub id: HealthReadingId,
    pub user_id: Uuid,
    pub health_member_id: HealthMemberId,
    pub recorded_on: NaiveDate,
    pub height_cm: Option<f64>,
    pub weight_kg: Option<f64>,
    pub systolic_mm_hg: Option<i32>,
    pub diastolic_mm_hg: Option<i32>,
    pub heart_rate_bpm: Option<i32>,
    pub notes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl HealthReading {
    /// Creates a reading for an active HealthMember after validation.
    ///
    /// Calls [`HealthMember::ensure_active_for_write`]. Copies `user_id` and
    /// `health_member_id` from `member`.
    pub fn create(
        member: &HealthMember,
        recorded_on: NaiveDate,
        vitals: HealthReadingVitals,
    ) -> Result<Self, AppError> {
        member.ensure_active_for_write()?;
        let HealthReadingVitals {
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes,
        } = Self::normalize_vitals(vitals)?;
        Self::validate_recorded_on(recorded_on)?;
        Self::validate_not_empty(
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes.as_deref(),
        )?;
        let now = Utc::now().naive_utc();
        Ok(Self {
            id: HealthReadingId::new(),
            user_id: member.user_id,
            health_member_id: member.id,
            recorded_on,
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes,
            created_at: now,
            updated_at: now,
        })
    }

    /// Rebuilds a HealthReading loaded from persistence.
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: HealthReadingId,
        user_id: Uuid,
        health_member_id: HealthMemberId,
        recorded_on: NaiveDate,
        height_cm: Option<f64>,
        weight_kg: Option<f64>,
        systolic_mm_hg: Option<i32>,
        diastolic_mm_hg: Option<i32>,
        heart_rate_bpm: Option<i32>,
        notes: Option<String>,
        created_at: NaiveDateTime,
        updated_at: NaiveDateTime,
    ) -> Self {
        Self {
            id,
            user_id,
            health_member_id,
            recorded_on,
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes,
            created_at,
            updated_at,
        }
    }

    pub fn is_owned_by(&self, user_id: &Uuid) -> bool {
        self.user_id == *user_id
    }

    /// BMI = weight_kg / (height_m)^2 when both height and weight are present.
    pub fn bmi(&self) -> Option<f64> {
        match (self.height_cm, self.weight_kg) {
            (Some(height_cm), Some(weight_kg)) if height_cm > 0.0 => {
                let height_m = height_cm / 100.0;
                Some(weight_kg / (height_m * height_m))
            }
            _ => None,
        }
    }

    /// Replaces vitals and optional recorded_on after validation.
    pub fn update(
        &mut self,
        recorded_on: NaiveDate,
        vitals: HealthReadingVitals,
    ) -> Result<(), AppError> {
        let HealthReadingVitals {
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes,
        } = Self::normalize_vitals(vitals)?;
        Self::validate_recorded_on(recorded_on)?;
        Self::validate_not_empty(
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes.as_deref(),
        )?;
        self.recorded_on = recorded_on;
        self.height_cm = height_cm;
        self.weight_kg = weight_kg;
        self.systolic_mm_hg = systolic_mm_hg;
        self.diastolic_mm_hg = diastolic_mm_hg;
        self.heart_rate_bpm = heart_rate_bpm;
        self.notes = notes;
        self.updated_at = Utc::now().naive_utc();
        Ok(())
    }

    fn normalize_vitals(vitals: HealthReadingVitals) -> Result<HealthReadingVitals, AppError> {
        let height_cm = Self::validate_positive_f64("height_cm", vitals.height_cm)?;
        let weight_kg = Self::validate_positive_f64("weight_kg", vitals.weight_kg)?;
        let (systolic_mm_hg, diastolic_mm_hg) =
            Self::validate_blood_pressure(vitals.systolic_mm_hg, vitals.diastolic_mm_hg)?;
        let heart_rate_bpm = Self::validate_positive_i32("heart_rate_bpm", vitals.heart_rate_bpm)?;
        let notes = Self::normalize_notes(vitals.notes.as_deref())?;
        Ok(HealthReadingVitals {
            height_cm,
            weight_kg,
            systolic_mm_hg,
            diastolic_mm_hg,
            heart_rate_bpm,
            notes,
        })
    }

    fn validate_not_empty(
        height_cm: Option<f64>,
        weight_kg: Option<f64>,
        systolic_mm_hg: Option<i32>,
        diastolic_mm_hg: Option<i32>,
        heart_rate_bpm: Option<i32>,
        notes: Option<&str>,
    ) -> Result<(), AppError> {
        let has_metric = height_cm.is_some()
            || weight_kg.is_some()
            || systolic_mm_hg.is_some()
            || diastolic_mm_hg.is_some()
            || heart_rate_bpm.is_some();
        let has_notes = notes.is_some();
        if has_metric || has_notes {
            Ok(())
        } else {
            Err(AppError::Validation(
                "reading must include at least one metric or notes".to_string(),
            ))
        }
    }

    fn validate_recorded_on(recorded_on: NaiveDate) -> Result<(), AppError> {
        let today = Utc::now().date_naive();
        if recorded_on > today {
            return Err(AppError::Validation(
                "recorded_on must not be in the future".to_string(),
            ));
        }
        Ok(())
    }

    fn validate_positive_f64(field: &str, value: Option<f64>) -> Result<Option<f64>, AppError> {
        match value {
            None => Ok(None),
            Some(v) if v.is_finite() && v > 0.0 => Ok(Some(v)),
            Some(_) => Err(AppError::Validation(format!(
                "{field} must be a positive finite number"
            ))),
        }
    }

    fn validate_positive_i32(field: &str, value: Option<i32>) -> Result<Option<i32>, AppError> {
        match value {
            None => Ok(None),
            Some(v) if v > 0 => Ok(Some(v)),
            Some(_) => Err(AppError::Validation(format!(
                "{field} must be a positive integer"
            ))),
        }
    }

    fn validate_blood_pressure(
        systolic: Option<i32>,
        diastolic: Option<i32>,
    ) -> Result<(Option<i32>, Option<i32>), AppError> {
        match (systolic, diastolic) {
            (None, None) => Ok((None, None)),
            (Some(_), None) | (None, Some(_)) => Err(AppError::Validation(
                "systolic_mm_hg and diastolic_mm_hg must both be set or both omitted".to_string(),
            )),
            (Some(sys), Some(dia)) => {
                if sys <= 0 || dia <= 0 {
                    return Err(AppError::Validation(
                        "blood pressure values must be positive".to_string(),
                    ));
                }
                if dia > sys {
                    return Err(AppError::Validation(
                        "diastolic_mm_hg must not be greater than systolic_mm_hg".to_string(),
                    ));
                }
                Ok((Some(sys), Some(dia)))
            }
        }
    }

    fn normalize_notes(notes: Option<&str>) -> Result<Option<String>, AppError> {
        match notes {
            None => Ok(None),
            Some(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    return Ok(None);
                }
                if trimmed.chars().count() > NOTES_MAX_LEN {
                    return Err(AppError::Validation(format!(
                        "notes must be at most {NOTES_MAX_LEN} characters"
                    )));
                }
                Ok(Some(trimmed.to_string()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn given_active_member() -> HealthMember {
        HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap()
    }

    fn given_vitals_height_weight() -> HealthReadingVitals {
        HealthReadingVitals {
            height_cm: Some(180.0),
            weight_kg: Some(75.0),
            ..Default::default()
        }
    }

    #[test]
    fn given_only_ids_and_date_when_create_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let err = HealthReading::create(&member, today, HealthReadingVitals::default()).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one metric or notes")
        ));
    }

    #[test]
    fn given_height_and_weight_when_create_then_accepted_and_bmi_computed() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let reading = HealthReading::create(&member, today, given_vitals_height_weight()).unwrap();
        assert_eq!(reading.health_member_id, member.id);
        assert_eq!(reading.user_id, member.user_id);
        assert_eq!(reading.height_cm, Some(180.0));
        assert_eq!(reading.weight_kg, Some(75.0));
        let bmi = reading.bmi().expect("bmi");
        // 75 / (1.8^2) = 23.148...
        assert!((bmi - 23.148148).abs() < 0.0001);
    }

    #[test]
    fn given_notes_only_when_create_then_accepted() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            notes: Some("  felt tired  ".to_string()),
            ..Default::default()
        };
        let reading = HealthReading::create(&member, today, vitals).unwrap();
        assert_eq!(reading.notes.as_deref(), Some("felt tired"));
        assert!(reading.bmi().is_none());
    }

    #[test]
    fn given_future_recorded_on_when_create_then_validation_error() {
        let member = given_active_member();
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);
        let err =
            HealthReading::create(&member, tomorrow, given_vitals_height_weight()).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("recorded_on")
        ));
    }

    #[test]
    fn given_old_recorded_on_when_create_then_accepted() {
        let member = given_active_member();
        let old = NaiveDate::from_ymd_opt(1990, 1, 15).unwrap();
        let reading = HealthReading::create(&member, old, given_vitals_height_weight()).unwrap();
        assert_eq!(reading.recorded_on, old);
    }

    #[test]
    fn given_zero_height_when_create_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            height_cm: Some(0.0),
            weight_kg: Some(70.0),
            ..Default::default()
        };
        let err = HealthReading::create(&member, today, vitals).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("height_cm")
        ));
    }

    #[test]
    fn given_negative_weight_when_create_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            weight_kg: Some(-1.0),
            ..Default::default()
        };
        let err = HealthReading::create(&member, today, vitals).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("weight_kg")
        ));
    }

    #[test]
    fn given_diastolic_greater_than_systolic_when_create_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            systolic_mm_hg: Some(110),
            diastolic_mm_hg: Some(120),
            ..Default::default()
        };
        let err = HealthReading::create(&member, today, vitals).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("diastolic_mm_hg")
        ));
    }

    #[test]
    fn given_only_systolic_when_create_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            systolic_mm_hg: Some(120),
            ..Default::default()
        };
        let err = HealthReading::create(&member, today, vitals).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("systolic_mm_hg and diastolic_mm_hg")
        ));
    }

    #[test]
    fn given_valid_blood_pressure_when_create_then_accepted() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            systolic_mm_hg: Some(120),
            diastolic_mm_hg: Some(80),
            ..Default::default()
        };
        let reading = HealthReading::create(&member, today, vitals).unwrap();
        assert_eq!(reading.systolic_mm_hg, Some(120));
        assert_eq!(reading.diastolic_mm_hg, Some(80));
    }

    #[test]
    fn given_inactive_member_when_create_then_validation_error() {
        let mut member = given_active_member();
        member.deactivate();
        let today = Utc::now().date_naive();
        let err =
            HealthReading::create(&member, today, given_vitals_height_weight()).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("inactive")
        ));
    }

    #[test]
    fn given_blank_notes_only_when_create_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let vitals = HealthReadingVitals {
            notes: Some("   ".to_string()),
            ..Default::default()
        };
        let err = HealthReading::create(&member, today, vitals).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one metric or notes")
        ));
    }

    #[test]
    fn given_reading_when_update_clears_all_metrics_then_validation_error() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let mut reading =
            HealthReading::create(&member, today, given_vitals_height_weight()).unwrap();
        let err = reading
            .update(today, HealthReadingVitals::default())
            .unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }
}
