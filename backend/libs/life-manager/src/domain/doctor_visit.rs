use backend_utils::AppError;
use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::health_member::{
    DISPLAY_NAME_MAX_LEN, HealthMember, HealthMemberId, NOTES_MAX_LEN,
};

/// Stable identity of a DoctorVisit aggregate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DoctorVisitId(pub Uuid);

impl DoctorVisitId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl Default for DoctorVisitId {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Uuid> for DoctorVisitId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl From<DoctorVisitId> for Uuid {
    fn from(value: DoctorVisitId) -> Self {
        value.0
    }
}

impl std::fmt::Display for DoctorVisitId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// One dated doctor visit for one HealthMember. Separate from Document.
///
/// Many visits on the same day are allowed. At least one of `provider_name`,
/// `reason`, or `notes` must be set after trim.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct DoctorVisit {
    pub id: DoctorVisitId,
    pub user_id: Uuid,
    pub health_member_id: HealthMemberId,
    pub visited_on: NaiveDate,
    pub provider_name: Option<String>,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl DoctorVisit {
    /// Creates a visit for an active HealthMember after validation.
    ///
    /// Calls [`HealthMember::ensure_active_for_write`]. Copies `user_id` and
    /// `health_member_id` from `member`.
    pub fn create(
        member: &HealthMember,
        visited_on: NaiveDate,
        provider_name: Option<&str>,
        reason: Option<&str>,
        notes: Option<&str>,
    ) -> Result<Self, AppError> {
        member.ensure_active_for_write()?;
        let (provider_name, reason, notes) = Self::normalize_text(provider_name, reason, notes)?;
        Self::validate_visited_on(visited_on)?;
        Self::validate_not_empty(&provider_name, &reason, &notes)?;
        let now = Utc::now().naive_utc();
        Ok(Self {
            id: DoctorVisitId::new(),
            user_id: member.user_id,
            health_member_id: member.id,
            visited_on,
            provider_name,
            reason,
            notes,
            created_at: now,
            updated_at: now,
        })
    }

    /// Rebuilds a DoctorVisit loaded from persistence.
    #[allow(clippy::too_many_arguments)]
    pub fn with_id(
        id: DoctorVisitId,
        user_id: Uuid,
        health_member_id: HealthMemberId,
        visited_on: NaiveDate,
        provider_name: Option<String>,
        reason: Option<String>,
        notes: Option<String>,
        created_at: NaiveDateTime,
        updated_at: NaiveDateTime,
    ) -> Self {
        Self {
            id,
            user_id,
            health_member_id,
            visited_on,
            provider_name,
            reason,
            notes,
            created_at,
            updated_at,
        }
    }

    pub fn is_owned_by(&self, user_id: &Uuid) -> bool {
        self.user_id == *user_id
    }

    /// Replaces `visited_on` and text fields after validation.
    ///
    /// The caller must check that the owning HealthMember is active.
    pub fn update(
        &mut self,
        visited_on: NaiveDate,
        provider_name: Option<&str>,
        reason: Option<&str>,
        notes: Option<&str>,
    ) -> Result<(), AppError> {
        let (provider_name, reason, notes) = Self::normalize_text(provider_name, reason, notes)?;
        Self::validate_visited_on(visited_on)?;
        Self::validate_not_empty(&provider_name, &reason, &notes)?;
        self.visited_on = visited_on;
        self.provider_name = provider_name;
        self.reason = reason;
        self.notes = notes;
        self.updated_at = Utc::now().naive_utc();
        Ok(())
    }

    #[allow(clippy::type_complexity)]
    fn normalize_text(
        provider_name: Option<&str>,
        reason: Option<&str>,
        notes: Option<&str>,
    ) -> Result<(Option<String>, Option<String>, Option<String>), AppError> {
        Ok((
            Self::normalize_optional("provider_name", provider_name, DISPLAY_NAME_MAX_LEN)?,
            Self::normalize_optional("reason", reason, NOTES_MAX_LEN)?,
            Self::normalize_optional("notes", notes, NOTES_MAX_LEN)?,
        ))
    }

    fn normalize_optional(
        field: &str,
        value: Option<&str>,
        max_len: usize,
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
        provider_name: &Option<String>,
        reason: &Option<String>,
        notes: &Option<String>,
    ) -> Result<(), AppError> {
        if provider_name.is_some() || reason.is_some() || notes.is_some() {
            Ok(())
        } else {
            Err(AppError::Validation(
                "visit must include at least one of provider_name, reason, or notes".to_string(),
            ))
        }
    }

    fn validate_visited_on(visited_on: NaiveDate) -> Result<(), AppError> {
        let today = Utc::now().date_naive();
        if visited_on > today {
            return Err(AppError::Validation(
                "visited_on must not be in the future".to_string(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn given_active_member() -> HealthMember {
        HealthMember::create(Uuid::new_v4(), "Alex", None, None).unwrap()
    }

    fn given_visit() -> (HealthMember, DoctorVisit) {
        let member = given_active_member();
        let visit = DoctorVisit::create(
            &member,
            Utc::now().date_naive(),
            Some("Dr. Lee"),
            Some("Checkup"),
            None,
        )
        .unwrap();
        (member, visit)
    }

    #[test]
    fn given_provider_only_when_create_then_accepted_and_ids_copied() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let visit = DoctorVisit::create(&member, today, Some("  Dr. Lee  "), None, None).unwrap();
        assert_eq!(visit.provider_name.as_deref(), Some("Dr. Lee"));
        assert!(visit.reason.is_none());
        assert!(visit.notes.is_none());
        assert_eq!(visit.user_id, member.user_id);
        assert_eq!(visit.health_member_id, member.id);
        assert!(visit.is_owned_by(&member.user_id));
    }

    #[test]
    fn given_reason_only_when_create_then_accepted() {
        let member = given_active_member();
        let visit =
            DoctorVisit::create(&member, Utc::now().date_naive(), None, Some("Flu"), None).unwrap();
        assert_eq!(visit.reason.as_deref(), Some("Flu"));
    }

    #[test]
    fn given_notes_only_when_create_then_accepted() {
        let member = given_active_member();
        let visit = DoctorVisit::create(&member, Utc::now().date_naive(), None, None, Some("Rest"))
            .unwrap();
        assert_eq!(visit.notes.as_deref(), Some("Rest"));
    }

    #[test]
    fn given_no_text_fields_when_create_then_validation_error() {
        let member = given_active_member();
        let err =
            DoctorVisit::create(&member, Utc::now().date_naive(), None, None, None).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one of")
        ));
    }

    #[test]
    fn given_blank_text_fields_when_create_then_validation_error() {
        let member = given_active_member();
        let err = DoctorVisit::create(
            &member,
            Utc::now().date_naive(),
            Some("  "),
            Some(""),
            Some("\n"),
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one of")
        ));
    }

    #[test]
    fn given_blank_field_with_other_set_when_create_then_blank_is_none() {
        let member = given_active_member();
        let visit = DoctorVisit::create(
            &member,
            Utc::now().date_naive(),
            Some("   "),
            Some("Flu"),
            Some(""),
        )
        .unwrap();
        assert!(visit.provider_name.is_none());
        assert_eq!(visit.reason.as_deref(), Some("Flu"));
        assert!(visit.notes.is_none());
    }

    #[test]
    fn given_future_visited_on_when_create_then_validation_error() {
        let member = given_active_member();
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);
        let err = DoctorVisit::create(&member, tomorrow, Some("Dr. Lee"), None, None).unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("visited_on")
        ));
    }

    #[test]
    fn given_old_visited_on_when_create_then_accepted() {
        let member = given_active_member();
        let old = NaiveDate::from_ymd_opt(1990, 1, 15).unwrap();
        let visit = DoctorVisit::create(&member, old, Some("Dr. Lee"), None, None).unwrap();
        assert_eq!(visit.visited_on, old);
    }

    #[test]
    fn given_inactive_member_when_create_then_validation_error() {
        let mut member = given_active_member();
        member.deactivate();
        let err = DoctorVisit::create(
            &member,
            Utc::now().date_naive(),
            Some("Dr. Lee"),
            None,
            None,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("inactive")
        ));
    }

    #[test]
    fn given_long_provider_name_when_create_then_validation_error() {
        let member = given_active_member();
        let name = "a".repeat(DISPLAY_NAME_MAX_LEN + 1);
        let err = DoctorVisit::create(&member, Utc::now().date_naive(), Some(&name), None, None)
            .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("provider_name")
        ));
    }

    #[test]
    fn given_provider_name_at_limit_when_create_then_accepted() {
        let member = given_active_member();
        let name = "a".repeat(DISPLAY_NAME_MAX_LEN);
        let visit =
            DoctorVisit::create(&member, Utc::now().date_naive(), Some(&name), None, None).unwrap();
        assert_eq!(visit.provider_name.as_deref(), Some(name.as_str()));
    }

    #[test]
    fn given_long_reason_when_create_then_validation_error() {
        let member = given_active_member();
        let text = "a".repeat(NOTES_MAX_LEN + 1);
        let err = DoctorVisit::create(&member, Utc::now().date_naive(), None, Some(&text), None)
            .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("reason")
        ));
    }

    #[test]
    fn given_long_notes_when_create_then_validation_error() {
        let member = given_active_member();
        let text = "a".repeat(NOTES_MAX_LEN + 1);
        let err = DoctorVisit::create(&member, Utc::now().date_naive(), None, None, Some(&text))
            .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("notes")
        ));
    }

    #[test]
    fn given_two_visits_same_day_when_create_then_both_accepted_with_distinct_ids() {
        let member = given_active_member();
        let today = Utc::now().date_naive();
        let a = DoctorVisit::create(&member, today, Some("Dr. A"), None, None).unwrap();
        let b = DoctorVisit::create(&member, today, Some("Dr. B"), None, None).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(a.visited_on, b.visited_on);
    }

    #[test]
    fn given_visit_when_update_then_fields_replaced_and_ids_kept() {
        let (member, mut visit) = given_visit();
        let id = visit.id;
        let before = visit.updated_at;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        visit
            .update(day, None, Some("Follow up"), Some("  Bring labs  "))
            .unwrap();
        assert_eq!(visit.id, id);
        assert_eq!(visit.health_member_id, member.id);
        assert_eq!(visit.visited_on, day);
        assert!(visit.provider_name.is_none());
        assert_eq!(visit.reason.as_deref(), Some("Follow up"));
        assert_eq!(visit.notes.as_deref(), Some("Bring labs"));
        assert!(visit.updated_at >= before);
    }

    #[test]
    fn given_visit_when_update_clears_all_text_then_validation_error_and_unchanged() {
        let (_, mut visit) = given_visit();
        let snapshot = visit.clone();
        let err = visit
            .update(visit.visited_on, Some(" "), None, Some(""))
            .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("at least one of")
        ));
        assert_eq!(visit, snapshot);
    }

    #[test]
    fn given_visit_when_update_to_future_date_then_validation_error() {
        let (_, mut visit) = given_visit();
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);
        let err = visit
            .update(tomorrow, Some("Dr. Lee"), None, None)
            .unwrap_err();
        assert!(matches!(
            err,
            AppError::Validation(msg) if msg.contains("visited_on")
        ));
    }
}
