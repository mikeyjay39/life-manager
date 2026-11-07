use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use serde::Serialize;

use crate::domain::{
    health_member::HealthMemberId,
    health_reading::{HealthReading, HealthReadingId},
};

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::health_readings)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct HealthReadingEntity {
    pub id: String,
    pub user_id: String,
    pub health_member_id: String,
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

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::health_readings)]
pub struct NewHealthReadingEntity {
    pub id: String,
    pub user_id: String,
    pub health_member_id: String,
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

#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::health_readings)]
pub struct UpdateHealthReadingEntity {
    pub recorded_on: NaiveDate,
    #[diesel(treat_none_as_null = true)]
    pub height_cm: Option<f64>,
    #[diesel(treat_none_as_null = true)]
    pub weight_kg: Option<f64>,
    #[diesel(treat_none_as_null = true)]
    pub systolic_mm_hg: Option<i32>,
    #[diesel(treat_none_as_null = true)]
    pub diastolic_mm_hg: Option<i32>,
    #[diesel(treat_none_as_null = true)]
    pub heart_rate_bpm: Option<i32>,
    #[diesel(treat_none_as_null = true)]
    pub notes: Option<String>,
    pub updated_at: NaiveDateTime,
}

impl HealthReadingEntity {
    pub fn into_domain(self) -> Option<HealthReading> {
        let id = uuid::Uuid::parse_str(&self.id).ok()?;
        let user_id = uuid::Uuid::parse_str(&self.user_id).ok()?;
        let health_member_id = uuid::Uuid::parse_str(&self.health_member_id).ok()?;
        Some(HealthReading::with_id(
            HealthReadingId(id),
            user_id,
            HealthMemberId(health_member_id),
            self.recorded_on,
            self.height_cm,
            self.weight_kg,
            self.systolic_mm_hg,
            self.diastolic_mm_hg,
            self.heart_rate_bpm,
            self.notes,
            self.created_at,
            self.updated_at,
        ))
    }
}

impl From<&HealthReading> for NewHealthReadingEntity {
    fn from(reading: &HealthReading) -> Self {
        Self {
            id: reading.id.to_string(),
            user_id: reading.user_id.to_string(),
            health_member_id: reading.health_member_id.to_string(),
            recorded_on: reading.recorded_on,
            height_cm: reading.height_cm,
            weight_kg: reading.weight_kg,
            systolic_mm_hg: reading.systolic_mm_hg,
            diastolic_mm_hg: reading.diastolic_mm_hg,
            heart_rate_bpm: reading.heart_rate_bpm,
            notes: reading.notes.clone(),
            created_at: reading.created_at,
            updated_at: reading.updated_at,
        }
    }
}

impl From<&HealthReading> for UpdateHealthReadingEntity {
    fn from(reading: &HealthReading) -> Self {
        Self {
            recorded_on: reading.recorded_on,
            height_cm: reading.height_cm,
            weight_kg: reading.weight_kg,
            systolic_mm_hg: reading.systolic_mm_hg,
            diastolic_mm_hg: reading.diastolic_mm_hg,
            heart_rate_bpm: reading.heart_rate_bpm,
            notes: reading.notes.clone(),
            updated_at: reading.updated_at,
        }
    }
}
