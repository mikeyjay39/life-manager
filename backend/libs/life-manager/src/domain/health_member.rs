use backend_utils::AppError;
use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Max length for `display_name` after trim.
pub const DISPLAY_NAME_MAX_LEN: usize = 100;

/// Max length for optional `notes` after trim.
pub const NOTES_MAX_LEN: usize = 2000;

/// Stable identity of a HealthMember aggregate.
///
/// Other aggregates (HealthReading, doctor visits) must store this id only.
/// They must not embed HealthMember fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct HealthMemberId(pub Uuid);

impl HealthMemberId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl Default for HealthMemberId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for HealthMemberId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl From<HealthMemberId> for Uuid {
    fn from(value: HealthMemberId) -> Self {
        value.0
    }
}

impl std::fmt::Display for HealthMemberId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Household person owned by an auth user. Separate from Document and HealthReading.
///
/// # Ownership rules (for HealthReading / GH-105)
/// - `user_id` is the auth owner. Only that user may create, update, deactivate, or list.
/// - Missing or other-user rows resolve as not found (HTTP 404), never 403.
/// - New readings or visits must call [`HealthMember::ensure_active_for_write`] first.
/// - Inactive rows stay queryable by id for the owner so history remains reachable.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct HealthMember {
    pub id: HealthMemberId,
    pub user_id: Uuid,
    pub display_name: String,
    pub birth_date: Option<NaiveDate>,
    pub notes: Option<String>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

impl HealthMember {
    /// Creates an active HealthMember after validation.
    pub fn create(
        user_id: Uuid,
        display_name: &str,
        birth_date: Option<NaiveDate>,
        notes: Option<&str>,
    ) -> Result<Self, AppError> {
        let display_name = Self::normalize_display_name(display_name)?;
        let birth_date = Self::validate_birth_date(birth_date)?;
        let notes = Self::normalize_notes(notes)?;
        let now = Utc::now().naive_utc();
        Ok(Self {
            id: HealthMemberId::new(),
            user_id,
            display_name,
            birth_date,
            notes,
            active: true,
            created_at: now,
            updated_at: now,
            deactivated_at: None,
        })
    }

    /// Rebuilds a HealthMember loaded from persistence.
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: HealthMemberId,
        user_id: Uuid,
        display_name: String,
        birth_date: Option<NaiveDate>,
        notes: Option<String>,
        active: bool,
        created_at: NaiveDateTime,
        updated_at: NaiveDateTime,
        deactivated_at: Option<NaiveDateTime>,
    ) -> Self {
        Self {
            id,
            user_id,
            display_name,
            birth_date,
            notes,
            active,
            created_at,
            updated_at,
            deactivated_at,
        }
    }

    pub fn is_owned_by(&self, user_id: &Uuid) -> bool {
        self.user_id == *user_id
    }

    /// Rejects writes that attach new data to an inactive member.
    pub fn ensure_active_for_write(&self) -> Result<(), AppError> {
        if self.active {
            Ok(())
        } else {
            Err(AppError::Validation(
                "HealthMember is inactive; reactivate before creating new readings or visits"
                    .to_string(),
            ))
        }
    }

    /// Updates profile fields. Leaves active state unchanged.
    pub fn update_profile(
        &mut self,
        display_name: &str,
        birth_date: Option<NaiveDate>,
        notes: Option<&str>,
    ) -> Result<(), AppError> {
        self.display_name = Self::normalize_display_name(display_name)?;
        self.birth_date = Self::validate_birth_date(birth_date)?;
        self.notes = Self::normalize_notes(notes)?;
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

    fn normalize_display_name(display_name: &str) -> Result<String, AppError> {
        let trimmed = display_name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "display_name must not be empty".to_string(),
            ));
        }
        if trimmed.chars().count() > DISPLAY_NAME_MAX_LEN {
            return Err(AppError::Validation(format!(
                "display_name must be at most {DISPLAY_NAME_MAX_LEN} characters"
            )));
        }
        Ok(trimmed.to_string())
    }

    fn validate_birth_date(birth_date: Option<NaiveDate>) -> Result<Option<NaiveDate>, AppError> {
        if let Some(date) = birth_date {
            let today = Utc::now().date_naive();
            if date > today {
                return Err(AppError::Validation(
                    "birth_date must not be in the future".to_string(),
                ));
            }
        }
        Ok(birth_date)
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

    #[test]
    fn given_valid_name_when_create_then_active_and_owned() {
        let user_id = Uuid::new_v4();
        let member = HealthMember::create(user_id, "  Alex  ", None, None).unwrap();
        assert_eq!(member.display_name, "Alex");
        assert!(member.active);
        assert!(member.deactivated_at.is_none());
        assert_eq!(member.user_id, user_id);
        assert!(member.is_owned_by(&user_id));
    }

    #[test]
    fn given_empty_name_when_create_then_validation_error() {
        let err = HealthMember::create(Uuid::new_v4(), "   ", None, None).unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("display_name")));
    }

    #[test]
    fn given_future_birth_date_when_create_then_validation_error() {
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);
        let err = HealthMember::create(Uuid::new_v4(), "Alex", Some(tomorrow), None).unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("birth_date")));
    }

    #[test]
    fn given_active_member_when_deactivate_then_inactive_with_timestamp() {
        let mut member = HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap();
        member.deactivate();
        assert!(!member.active);
        assert!(member.deactivated_at.is_some());
        assert!(member.ensure_active_for_write().is_err());
    }

    #[test]
    fn given_inactive_member_when_deactivate_again_then_stays_inactive() {
        let mut member = HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap();
        member.deactivate();
        let first = member.deactivated_at;
        member.deactivate();
        assert!(!member.active);
        assert_eq!(member.deactivated_at, first);
    }

    #[test]
    fn given_inactive_member_when_reactivate_then_active_again() {
        let mut member = HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap();
        member.deactivate();
        member.reactivate();
        assert!(member.active);
        assert!(member.deactivated_at.is_none());
        assert!(member.ensure_active_for_write().is_ok());
    }

    #[test]
    fn given_blank_notes_when_create_then_stores_none() {
        let member = HealthMember::create(Uuid::new_v4(), "Alex", None, Some("  ")).unwrap();
        assert!(member.notes.is_none());
    }

    #[test]
    fn given_unicode_name_within_char_limit_when_create_then_ok() {
        // 50 multi-byte chars (150 UTF-8 bytes) must pass a 100-character limit.
        let name: String = "あ".repeat(50);
        let member = HealthMember::create(Uuid::new_v4(), &name, None, None).unwrap();
        assert_eq!(member.display_name.chars().count(), 50);
    }

    #[test]
    fn given_unicode_name_over_char_limit_when_create_then_validation_error() {
        let name: String = "あ".repeat(DISPLAY_NAME_MAX_LEN + 1);
        let err = HealthMember::create(Uuid::new_v4(), &name, None, None).unwrap_err();
        assert!(matches!(err, AppError::Validation(msg) if msg.contains("display_name")));
    }

    #[test]
    fn given_notes_when_update_profile_keep_then_notes_unchanged() {
        let mut member =
            HealthMember::create(Uuid::new_v4(), "Alex", None, Some("keep me")).unwrap();
        let birth = member.birth_date;
        let notes = member.notes.clone();
        member
            .update_profile("Alexandra", birth, notes.as_deref())
            .unwrap();
        assert_eq!(member.display_name, "Alexandra");
        assert_eq!(member.notes.as_deref(), Some("keep me"));
    }
}
