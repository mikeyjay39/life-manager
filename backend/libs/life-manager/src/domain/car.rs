use backend_utils::AppError;
use chrono::{Datelike, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Max length for optional `display_name` after trim.
pub const DISPLAY_NAME_MAX_LEN: usize = 100;

/// Max length for optional `notes` after trim.
pub const NOTES_MAX_LEN: usize = 2000;

/// Max length for optional `license_plate` after trim.
pub const LICENSE_PLATE_MAX_LEN: usize = 32;

/// Max length for required `make` / `model` after trim.
pub const MAKE_MODEL_MAX_LEN: usize = 100;

/// VIN length when present (ISO 3779).
pub const VIN_LEN: usize = 17;

/// Earliest allowed model year.
pub const YEAR_MIN: i32 = 1900;

/// Stable identity of a Car aggregate.
///
/// Maintenance events must store this id only. They must not embed Car fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CarId(pub Uuid);

impl CarId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl Default for CarId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for CarId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl From<CarId> for Uuid {
    fn from(value: CarId) -> Self {
        value.0
    }
}

impl std::fmt::Display for CarId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Household vehicle owned by an auth user. Separate from Document.
///
/// Document links store UUID refs only. Ownership of those Documents is checked
/// in the application layer before set.
///
/// # Ownership rules
/// - `user_id` is the auth owner. Only that user may create, update, deactivate, or delete.
/// - Missing or other-user rows resolve as not found (HTTP 404), never 403.
/// - Inactive rows stay queryable by id for the owner.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Car {
    pub id: CarId,
    pub user_id: Uuid,
    pub display_name: Option<String>,
    pub make: String,
    pub model: String,
    pub year: i32,
    pub vin: Option<String>,
    pub license_plate: Option<String>,
    pub notes: Option<String>,
    pub insurance_document_id: Option<Uuid>,
    pub registration_document_id: Option<Uuid>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

/// Input fields for create / profile update (without active state).
pub struct CarProfileInput<'a> {
    pub display_name: Option<&'a str>,
    pub make: &'a str,
    pub model: &'a str,
    pub year: i32,
    pub vin: Option<&'a str>,
    pub license_plate: Option<&'a str>,
    pub notes: Option<&'a str>,
    pub insurance_document_id: Option<Uuid>,
    pub registration_document_id: Option<Uuid>,
}

impl Car {
    /// Creates an active Car after validation.
    pub fn create(user_id: Uuid, input: CarProfileInput<'_>) -> Result<Self, AppError> {
        let profile = Self::normalize_profile(input)?;
        let now = Utc::now().naive_utc();
        Ok(Self {
            id: CarId::new(),
            user_id,
            display_name: profile.display_name,
            make: profile.make,
            model: profile.model,
            year: profile.year,
            vin: profile.vin,
            license_plate: profile.license_plate,
            notes: profile.notes,
            insurance_document_id: profile.insurance_document_id,
            registration_document_id: profile.registration_document_id,
            active: true,
            created_at: now,
            updated_at: now,
            deactivated_at: None,
        })
    }

    /// Rebuilds a Car loaded from persistence.
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: CarId,
        user_id: Uuid,
        display_name: Option<String>,
        make: String,
        model: String,
        year: i32,
        vin: Option<String>,
        license_plate: Option<String>,
        notes: Option<String>,
        insurance_document_id: Option<Uuid>,
        registration_document_id: Option<Uuid>,
        active: bool,
        created_at: NaiveDateTime,
        updated_at: NaiveDateTime,
        deactivated_at: Option<NaiveDateTime>,
    ) -> Self {
        Self {
            id,
            user_id,
            display_name,
            make,
            model,
            year,
            vin,
            license_plate,
            notes,
            insurance_document_id,
            registration_document_id,
            active,
            created_at,
            updated_at,
            deactivated_at,
        }
    }

    pub fn is_owned_by(&self, user_id: &Uuid) -> bool {
        self.user_id == *user_id
    }

    /// Rejects writes that attach new data to an inactive car.
    pub fn ensure_active_for_write(&self) -> Result<(), AppError> {
        if self.active {
            Ok(())
        } else {
            Err(AppError::Validation(
                "Car is inactive; reactivate before creating new maintenance events".to_string(),
            ))
        }
    }

    /// Updates identity and document-link fields. Leaves active state unchanged.
    pub fn update_profile(&mut self, input: CarProfileInput<'_>) -> Result<(), AppError> {
        let profile = Self::normalize_profile(input)?;
        self.display_name = profile.display_name;
        self.make = profile.make;
        self.model = profile.model;
        self.year = profile.year;
        self.vin = profile.vin;
        self.license_plate = profile.license_plate;
        self.notes = profile.notes;
        self.insurance_document_id = profile.insurance_document_id;
        self.registration_document_id = profile.registration_document_id;
        self.touch();
        Ok(())
    }

    /// Sets active false and records deactivated_at. Idempotent when already inactive.
    pub fn deactivate(&mut self) {
        if !self.active {
            self.touch();
            return;
        }
        self.active = false;
        self.deactivated_at = Some(Utc::now().naive_utc());
        self.touch();
    }

    /// Sets active true and clears deactivated_at. Idempotent when already active.
    pub fn reactivate(&mut self) {
        if self.active {
            self.touch();
            return;
        }
        self.active = true;
        self.deactivated_at = None;
        self.touch();
    }

    fn touch(&mut self) {
        self.updated_at = Utc::now().naive_utc();
    }

    fn normalize_profile(input: CarProfileInput<'_>) -> Result<NormalizedProfile, AppError> {
        Ok(NormalizedProfile {
            display_name: Self::normalize_optional_text(
                input.display_name,
                DISPLAY_NAME_MAX_LEN,
                "display_name",
            )?,
            make: Self::normalize_required_text(input.make, MAKE_MODEL_MAX_LEN, "make")?,
            model: Self::normalize_required_text(input.model, MAKE_MODEL_MAX_LEN, "model")?,
            year: Self::validate_year(input.year)?,
            vin: Self::normalize_vin(input.vin)?,
            license_plate: Self::normalize_license_plate(input.license_plate)?,
            notes: Self::normalize_optional_text(input.notes, NOTES_MAX_LEN, "notes")?,
            insurance_document_id: input.insurance_document_id,
            registration_document_id: input.registration_document_id,
        })
    }

    fn normalize_required_text(
        value: &str,
        max_len: usize,
        field: &str,
    ) -> Result<String, AppError> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(format!("{field} must not be empty")));
        }
        if trimmed.chars().count() > max_len {
            return Err(AppError::Validation(format!(
                "{field} must be at most {max_len} characters"
            )));
        }
        Ok(trimmed.to_string())
    }

    fn normalize_optional_text(
        value: Option<&str>,
        max_len: usize,
        field: &str,
    ) -> Result<Option<String>, AppError> {
        match value {
            None => Ok(None),
            Some(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    return Ok(None);
                }
                if trimmed.chars().count() > max_len {
                    return Err(AppError::Validation(format!(
                        "{field} must be at most {max_len} characters"
                    )));
                }
                Ok(Some(trimmed.to_string()))
            }
        }
    }

    fn validate_year(year: i32) -> Result<i32, AppError> {
        let max_year = Utc::now().year() + 1;
        if year < YEAR_MIN || year > max_year {
            return Err(AppError::Validation(format!(
                "year must be between {YEAR_MIN} and {max_year}"
            )));
        }
        Ok(year)
    }

    /// Normalizes VIN: trim, uppercase; empty → None; when present must be 17 chars A-HJ-NPR-Z0-9.
    fn normalize_vin(vin: Option<&str>) -> Result<Option<String>, AppError> {
        match vin {
            None => Ok(None),
            Some(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    return Ok(None);
                }
                let upper = trimmed.to_uppercase();
                if upper.chars().count() != VIN_LEN {
                    return Err(AppError::Validation(format!(
                        "vin must be {VIN_LEN} characters when provided"
                    )));
                }
                if !upper.chars().all(is_vin_char) {
                    return Err(AppError::Validation(
                        "vin must use characters A-H, J-N, P, R-Z, and 0-9 only".to_string(),
                    ));
                }
                Ok(Some(upper))
            }
        }
    }

    fn normalize_license_plate(plate: Option<&str>) -> Result<Option<String>, AppError> {
        match plate {
            None => Ok(None),
            Some(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    return Ok(None);
                }
                if trimmed.chars().count() > LICENSE_PLATE_MAX_LEN {
                    return Err(AppError::Validation(format!(
                        "license_plate must be at most {LICENSE_PLATE_MAX_LEN} characters"
                    )));
                }
                Ok(Some(trimmed.to_uppercase()))
            }
        }
    }
}

struct NormalizedProfile {
    display_name: Option<String>,
    make: String,
    model: String,
    year: i32,
    vin: Option<String>,
    license_plate: Option<String>,
    notes: Option<String>,
    insurance_document_id: Option<Uuid>,
    registration_document_id: Option<Uuid>,
}

fn is_vin_char(c: char) -> bool {
    matches!(c, 'A'..='H' | 'J'..='N' | 'P' | 'R'..='Z' | '0'..='9')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input<'a>() -> CarProfileInput<'a> {
        CarProfileInput {
            display_name: None,
            make: "Toyota",
            model: "Corolla",
            year: 2020,
            vin: None,
            license_plate: None,
            notes: None,
            insurance_document_id: None,
            registration_document_id: None,
        }
    }

    #[test]
    fn given_valid_fields_when_create_then_active_and_owned() {
        let user_id = Uuid::new_v4();
        let car = Car::create(
            user_id,
            CarProfileInput {
                display_name: Some("  Daily  "),
                make: "  Toyota  ",
                model: "  Corolla  ",
                year: 2020,
                vin: Some("1hgcm82633a004352"),
                license_plate: Some(" abc123 "),
                notes: Some("  note  "),
                insurance_document_id: None,
                registration_document_id: None,
            },
        )
        .unwrap();
        assert_eq!(car.display_name.as_deref(), Some("Daily"));
        assert_eq!(car.make, "Toyota");
        assert_eq!(car.model, "Corolla");
        assert_eq!(car.vin.as_deref(), Some("1HGCM82633A004352"));
        assert_eq!(car.license_plate.as_deref(), Some("ABC123"));
        assert_eq!(car.notes.as_deref(), Some("note"));
        assert!(car.active);
        assert!(car.deactivated_at.is_none());
        assert_eq!(car.user_id, user_id);
        assert!(car.is_owned_by(&user_id));
    }

    #[test]
    fn given_empty_make_when_create_then_validation_error() {
        let err = Car::create(
            Uuid::new_v4(),
            CarProfileInput {
                make: "   ",
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("make")));
    }

    #[test]
    fn given_year_out_of_range_when_create_then_validation_error() {
        let err = Car::create(
            Uuid::new_v4(),
            CarProfileInput {
                year: 1800,
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("year")));
    }

    #[test]
    fn given_invalid_vin_charset_when_create_then_validation_error() {
        let err = Car::create(
            Uuid::new_v4(),
            CarProfileInput {
                vin: Some("1HGCM82633A00435I"), // I is invalid
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("vin")));
    }

    #[test]
    fn given_short_vin_when_create_then_validation_error() {
        let err = Car::create(
            Uuid::new_v4(),
            CarProfileInput {
                vin: Some("SHORT"),
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("vin")));
    }

    #[test]
    fn given_blank_vin_when_create_then_stores_none() {
        let car = Car::create(
            Uuid::new_v4(),
            CarProfileInput {
                vin: Some("  "),
                ..base_input()
            },
        )
        .unwrap();
        assert!(car.vin.is_none());
    }

    #[test]
    fn given_active_car_when_deactivate_then_inactive_with_timestamp() {
        let mut car = Car::create(Uuid::new_v4(), base_input()).unwrap();
        car.deactivate();
        assert!(!car.active);
        assert!(car.deactivated_at.is_some());
        assert!(car.ensure_active_for_write().is_err());
    }

    #[test]
    fn given_inactive_car_when_deactivate_again_then_stays_inactive() {
        let mut car = Car::create(Uuid::new_v4(), base_input()).unwrap();
        car.deactivate();
        let first = car.deactivated_at;
        car.deactivate();
        assert!(!car.active);
        assert_eq!(car.deactivated_at, first);
    }

    #[test]
    fn given_inactive_car_when_reactivate_then_active_again() {
        let mut car = Car::create(Uuid::new_v4(), base_input()).unwrap();
        car.deactivate();
        car.reactivate();
        assert!(car.active);
        assert!(car.deactivated_at.is_none());
        assert!(car.ensure_active_for_write().is_ok());
    }
}
