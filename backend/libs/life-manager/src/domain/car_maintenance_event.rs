use backend_utils::AppError;
use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::car::{Car, CarId, DISPLAY_NAME_MAX_LEN, NOTES_MAX_LEN};

/// Max length for optional `title` after trim.
pub const TITLE_MAX_LEN: usize = DISPLAY_NAME_MAX_LEN;

/// Stable identity of a CarMaintenanceEvent aggregate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CarMaintenanceEventId(pub Uuid);

impl CarMaintenanceEventId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl Default for CarMaintenanceEventId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for CarMaintenanceEventId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl From<CarMaintenanceEventId> for Uuid {
    fn from(value: CarMaintenanceEventId) -> Self {
        value.0
    }
}

impl std::fmt::Display for CarMaintenanceEventId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Kind of maintenance work recorded for a Car.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CarMaintenanceEventType {
    OilChange,
    Tire,
    Brakes,
    Service,
    Repair,
    Other,
}

impl CarMaintenanceEventType {
    /// Wire / DB string for this type.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OilChange => "oil_change",
            Self::Tire => "tire",
            Self::Brakes => "brakes",
            Self::Service => "service",
            Self::Repair => "repair",
            Self::Other => "other",
        }
    }

    /// Parses a stored event_type value. Rejects unknown strings.
    pub fn parse(raw: &str) -> Result<Self, AppError> {
        match raw.trim() {
            "oil_change" => Ok(Self::OilChange),
            "tire" => Ok(Self::Tire),
            "brakes" => Ok(Self::Brakes),
            "service" => Ok(Self::Service),
            "repair" => Ok(Self::Repair),
            "other" => Ok(Self::Other),
            _ => Err(AppError::Validation(format!(
                "unknown event_type: {raw}"
            ))),
        }
    }
}

impl std::fmt::Display for CarMaintenanceEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Create / update field bag for a maintenance event (without identity).
pub struct CarMaintenanceEventInput<'a> {
    pub occurred_on: NaiveDate,
    pub event_type: CarMaintenanceEventType,
    pub odometer_miles: Option<i32>,
    pub cost_cents: Option<i64>,
    pub title: Option<&'a str>,
    pub notes: Option<&'a str>,
    pub document_id: Option<Uuid>,
}

/// One dated service/repair event for one Car. Separate from Document tables.
///
/// Many events on the same day for the same Car are allowed. At least one of
/// `title`, `notes`, `odometer_miles`, or `cost_cents` must be set after
/// normalize. Optional `document_id` stores a UUID only in this story.
///
/// # Ownership rules
/// - `user_id` and `car_id` copy from the parent Car on create.
/// - Inactive Cars reject new events via [`Car::ensure_active_for_write`].
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct CarMaintenanceEvent {
    pub id: CarMaintenanceEventId,
    pub user_id: Uuid,
    pub car_id: CarId,
    pub occurred_on: NaiveDate,
    pub event_type: CarMaintenanceEventType,
    pub odometer_miles: Option<i32>,
    pub cost_cents: Option<i64>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub document_id: Option<Uuid>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl CarMaintenanceEvent {
    /// Creates an event for an active Car after validation.
    ///
    /// Calls [`Car::ensure_active_for_write`]. Copies `user_id` and `car_id`
    /// from `car`.
    pub fn create(car: &Car, input: CarMaintenanceEventInput<'_>) -> Result<Self, AppError> {
        car.ensure_active_for_write()?;
        let normalized = Self::normalize_input(input)?;
        let now = Utc::now().naive_utc();
        Ok(Self {
            id: CarMaintenanceEventId::new(),
            user_id: car.user_id,
            car_id: car.id,
            occurred_on: normalized.occurred_on,
            event_type: normalized.event_type,
            odometer_miles: normalized.odometer_miles,
            cost_cents: normalized.cost_cents,
            title: normalized.title,
            notes: normalized.notes,
            document_id: normalized.document_id,
            created_at: now,
            updated_at: now,
        })
    }

    /// Rebuilds a CarMaintenanceEvent loaded from persistence.
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: CarMaintenanceEventId,
        user_id: Uuid,
        car_id: CarId,
        occurred_on: NaiveDate,
        event_type: CarMaintenanceEventType,
        odometer_miles: Option<i32>,
        cost_cents: Option<i64>,
        title: Option<String>,
        notes: Option<String>,
        document_id: Option<Uuid>,
        created_at: NaiveDateTime,
        updated_at: NaiveDateTime,
    ) -> Self {
        Self {
            id,
            user_id,
            car_id,
            occurred_on,
            event_type,
            odometer_miles,
            cost_cents,
            title,
            notes,
            document_id,
            created_at,
            updated_at,
        }
    }

    pub fn is_owned_by(&self, user_id: &Uuid) -> bool {
        self.user_id == *user_id
    }

    fn normalize_input(
        input: CarMaintenanceEventInput<'_>,
    ) -> Result<NormalizedEvent, AppError> {
        Self::validate_occurred_on(input.occurred_on)?;
        let odometer_miles = Self::validate_odometer(input.odometer_miles)?;
        let cost_cents = Self::validate_cost(input.cost_cents)?;
        let title = Self::normalize_optional_text(input.title, TITLE_MAX_LEN, "title")?;
        let notes = Self::normalize_optional_text(input.notes, NOTES_MAX_LEN, "notes")?;
        Self::validate_not_empty(&title, &notes, odometer_miles, cost_cents)?;
        Ok(NormalizedEvent {
            occurred_on: input.occurred_on,
            event_type: input.event_type,
            odometer_miles,
            cost_cents,
            title,
            notes,
            document_id: input.document_id,
        })
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

    fn validate_not_empty(
        title: &Option<String>,
        notes: &Option<String>,
        odometer_miles: Option<i32>,
        cost_cents: Option<i64>,
    ) -> Result<(), AppError> {
        if title.is_some()
            || notes.is_some()
            || odometer_miles.is_some()
            || cost_cents.is_some()
        {
            Ok(())
        } else {
            Err(AppError::Validation(
                "event must include at least one of title, notes, odometer_miles, or cost_cents"
                    .to_string(),
            ))
        }
    }

    fn validate_occurred_on(occurred_on: NaiveDate) -> Result<(), AppError> {
        let today = Utc::now().date_naive();
        if occurred_on > today {
            return Err(AppError::Validation(
                "occurred_on must not be in the future".to_string(),
            ));
        }
        Ok(())
    }

    fn validate_odometer(odometer_miles: Option<i32>) -> Result<Option<i32>, AppError> {
        match odometer_miles {
            None => Ok(None),
            Some(miles) if miles < 0 => Err(AppError::Validation(
                "odometer_miles must be >= 0".to_string(),
            )),
            Some(miles) => Ok(Some(miles)),
        }
    }

    fn validate_cost(cost_cents: Option<i64>) -> Result<Option<i64>, AppError> {
        match cost_cents {
            None => Ok(None),
            Some(cents) if cents < 0 => Err(AppError::Validation(
                "cost_cents must be >= 0".to_string(),
            )),
            Some(cents) => Ok(Some(cents)),
        }
    }
}

struct NormalizedEvent {
    occurred_on: NaiveDate,
    event_type: CarMaintenanceEventType,
    odometer_miles: Option<i32>,
    cost_cents: Option<i64>,
    title: Option<String>,
    notes: Option<String>,
    document_id: Option<Uuid>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::car::CarProfileInput;

    fn given_active_car() -> Car {
        Car::create(
            Uuid::new_v4(),
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
            },
        )
        .unwrap()
    }

    fn base_input<'a>() -> CarMaintenanceEventInput<'a> {
        CarMaintenanceEventInput {
            occurred_on: Utc::now().date_naive(),
            event_type: CarMaintenanceEventType::Service,
            odometer_miles: None,
            cost_cents: None,
            title: Some("Tune-up"),
            notes: None,
            document_id: None,
        }
    }

    #[test]
    fn given_empty_event_when_create_then_validation_fails() {
        let car = given_active_car();
        let err = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                title: None,
                notes: None,
                odometer_miles: None,
                cost_cents: None,
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one of")
        ));
    }

    #[test]
    fn given_blank_text_only_when_create_then_validation_fails() {
        let car = given_active_car();
        let err = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                title: Some("  "),
                notes: Some(""),
                odometer_miles: None,
                cost_cents: None,
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one of")
        ));
    }

    #[test]
    fn given_oil_change_with_odometer_and_cost_when_create_then_accepted() {
        let car = given_active_car();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                event_type: CarMaintenanceEventType::OilChange,
                odometer_miles: Some(42_000),
                cost_cents: Some(4_999),
                title: None,
                notes: None,
                ..base_input()
            },
        )
        .unwrap();
        assert_eq!(event.event_type, CarMaintenanceEventType::OilChange);
        assert_eq!(event.odometer_miles, Some(42_000));
        assert_eq!(event.cost_cents, Some(4_999));
        assert_eq!(event.user_id, car.user_id);
        assert_eq!(event.car_id, car.id);
        assert!(event.is_owned_by(&car.user_id));
    }

    #[test]
    fn given_negative_cost_when_create_then_validation_fails() {
        let car = given_active_car();
        let err = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                cost_cents: Some(-1),
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("cost_cents")
        ));
    }

    #[test]
    fn given_zero_cost_when_create_then_accepted() {
        let car = given_active_car();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                cost_cents: Some(0),
                title: None,
                ..base_input()
            },
        )
        .unwrap();
        assert_eq!(event.cost_cents, Some(0));
    }

    #[test]
    fn given_negative_odometer_when_create_then_validation_fails() {
        let car = given_active_car();
        let err = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                odometer_miles: Some(-1),
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("odometer_miles")
        ));
    }

    #[test]
    fn given_unknown_event_type_when_parse_then_validation_fails() {
        let err = CarMaintenanceEventType::parse("bogus").unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("unknown event_type")
        ));
    }

    #[test]
    fn given_known_event_types_when_parse_then_round_trip() {
        for ty in [
            CarMaintenanceEventType::OilChange,
            CarMaintenanceEventType::Tire,
            CarMaintenanceEventType::Brakes,
            CarMaintenanceEventType::Service,
            CarMaintenanceEventType::Repair,
            CarMaintenanceEventType::Other,
        ] {
            assert_eq!(CarMaintenanceEventType::parse(ty.as_str()).unwrap(), ty);
        }
    }

    #[test]
    fn given_future_occurred_on_when_create_then_validation_fails() {
        let car = given_active_car();
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);
        let err = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                occurred_on: tomorrow,
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("occurred_on")
        ));
    }

    #[test]
    fn given_old_occurred_on_when_create_then_accepted() {
        let car = given_active_car();
        let old = NaiveDate::from_ymd_opt(1990, 1, 15).unwrap();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                occurred_on: old,
                ..base_input()
            },
        )
        .unwrap();
        assert_eq!(event.occurred_on, old);
    }

    #[test]
    fn given_same_day_two_event_types_when_create_then_both_accepted() {
        let car = given_active_car();
        let today = Utc::now().date_naive();
        let oil = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                occurred_on: today,
                event_type: CarMaintenanceEventType::OilChange,
                odometer_miles: Some(10_000),
                title: None,
                ..base_input()
            },
        )
        .unwrap();
        let tire = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                occurred_on: today,
                event_type: CarMaintenanceEventType::Tire,
                title: Some("Rotate"),
                ..base_input()
            },
        )
        .unwrap();
        assert_ne!(oil.id, tire.id);
        assert_eq!(oil.occurred_on, tire.occurred_on);
        assert_ne!(oil.event_type, tire.event_type);
    }

    #[test]
    fn given_inactive_car_when_create_then_validation_fails() {
        let mut car = given_active_car();
        car.deactivate();
        let err = CarMaintenanceEvent::create(&car, base_input()).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("inactive")
        ));
    }

    #[test]
    fn given_title_only_when_create_then_accepted_and_trimmed() {
        let car = given_active_car();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                title: Some("  Oil  "),
                notes: None,
                odometer_miles: None,
                cost_cents: None,
                ..base_input()
            },
        )
        .unwrap();
        assert_eq!(event.title.as_deref(), Some("Oil"));
    }

    #[test]
    fn given_notes_only_when_create_then_accepted() {
        let car = given_active_car();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                title: None,
                notes: Some("Dealer visit"),
                odometer_miles: None,
                cost_cents: None,
                ..base_input()
            },
        )
        .unwrap();
        assert_eq!(event.notes.as_deref(), Some("Dealer visit"));
    }

    #[test]
    fn given_long_title_when_create_then_validation_fails() {
        let car = given_active_car();
        let title = "a".repeat(TITLE_MAX_LEN + 1);
        let err = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                title: Some(&title),
                ..base_input()
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("title")
        ));
    }

    #[test]
    fn given_optional_document_id_when_create_then_stored() {
        let car = given_active_car();
        let doc_id = Uuid::new_v4();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                document_id: Some(doc_id),
                ..base_input()
            },
        )
        .unwrap();
        assert_eq!(event.document_id, Some(doc_id));
    }
}
