use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use serde::Serialize;

use crate::domain::health_member::{HealthMember, HealthMemberId};

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::health_members)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct HealthMemberEntity {
    pub id: String,
    pub user_id: String,
    pub display_name: String,
    pub birth_date: Option<NaiveDate>,
    pub notes: Option<String>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::health_members)]
pub struct NewHealthMemberEntity {
    pub id: String,
    pub user_id: String,
    pub display_name: String,
    pub birth_date: Option<NaiveDate>,
    pub notes: Option<String>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::health_members)]
pub struct UpdateHealthMemberEntity {
    pub display_name: String,
    #[diesel(treat_none_as_null = true)]
    pub birth_date: Option<NaiveDate>,
    #[diesel(treat_none_as_null = true)]
    pub notes: Option<String>,
    pub active: bool,
    pub updated_at: NaiveDateTime,
    #[diesel(treat_none_as_null = true)]
    pub deactivated_at: Option<NaiveDateTime>,
}

impl HealthMemberEntity {
    pub fn into_domain(self) -> Option<HealthMember> {
        let id = uuid::Uuid::parse_str(&self.id).ok()?;
        let user_id = uuid::Uuid::parse_str(&self.user_id).ok()?;
        Some(HealthMember::with_id(
            HealthMemberId(id),
            user_id,
            self.display_name,
            self.birth_date,
            self.notes,
            self.active,
            self.created_at,
            self.updated_at,
            self.deactivated_at,
        ))
    }
}

impl From<&HealthMember> for NewHealthMemberEntity {
    fn from(member: &HealthMember) -> Self {
        Self {
            id: member.id.to_string(),
            user_id: member.user_id.to_string(),
            display_name: member.display_name.clone(),
            birth_date: member.birth_date,
            notes: member.notes.clone(),
            active: member.active,
            created_at: member.created_at,
            updated_at: member.updated_at,
            deactivated_at: member.deactivated_at,
        }
    }
}

impl From<&HealthMember> for UpdateHealthMemberEntity {
    fn from(member: &HealthMember) -> Self {
        Self {
            display_name: member.display_name.clone(),
            birth_date: member.birth_date,
            notes: member.notes.clone(),
            active: member.active,
            updated_at: member.updated_at,
            deactivated_at: member.deactivated_at,
        }
    }
}
