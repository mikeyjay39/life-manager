use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use serde::Serialize;

use crate::domain::{
    doctor_visit::{DoctorVisit, DoctorVisitId},
    health_member::HealthMemberId,
};

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::doctor_visits)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct DoctorVisitEntity {
    pub id: String,
    pub user_id: String,
    pub health_member_id: String,
    pub visited_on: NaiveDate,
    pub provider_name: Option<String>,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::doctor_visits)]
pub struct NewDoctorVisitEntity {
    pub id: String,
    pub user_id: String,
    pub health_member_id: String,
    pub visited_on: NaiveDate,
    pub provider_name: Option<String>,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::doctor_visits)]
pub struct UpdateDoctorVisitEntity {
    pub visited_on: NaiveDate,
    #[diesel(treat_none_as_null = true)]
    pub provider_name: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub reason: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub notes: Option<String>,
    pub updated_at: NaiveDateTime,
}

impl DoctorVisitEntity {
    pub fn into_domain(self) -> Option<DoctorVisit> {
        let id = uuid::Uuid::parse_str(&self.id).ok()?;
        let user_id = uuid::Uuid::parse_str(&self.user_id).ok()?;
        let health_member_id = uuid::Uuid::parse_str(&self.health_member_id).ok()?;
        Some(DoctorVisit::with_id(
            DoctorVisitId(id),
            user_id,
            HealthMemberId(health_member_id),
            self.visited_on,
            self.provider_name,
            self.reason,
            self.notes,
            self.created_at,
            self.updated_at,
        ))
    }
}

impl From<&DoctorVisit> for NewDoctorVisitEntity {
    fn from(visit: &DoctorVisit) -> Self {
        Self {
            id: visit.id.to_string(),
            user_id: visit.user_id.to_string(),
            health_member_id: visit.health_member_id.to_string(),
            visited_on: visit.visited_on,
            provider_name: visit.provider_name.clone(),
            reason: visit.reason.clone(),
            notes: visit.notes.clone(),
            created_at: visit.created_at,
            updated_at: visit.updated_at,
        }
    }
}

impl From<&DoctorVisit> for UpdateDoctorVisitEntity {
    fn from(visit: &DoctorVisit) -> Self {
        Self {
            visited_on: visit.visited_on,
            provider_name: visit.provider_name.clone(),
            reason: visit.reason.clone(),
            notes: visit.notes.clone(),
            updated_at: visit.updated_at,
        }
    }
}
