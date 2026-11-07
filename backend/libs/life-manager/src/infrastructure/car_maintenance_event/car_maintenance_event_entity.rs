use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use serde::Serialize;

use crate::domain::{
    car::CarId,
    car_maintenance_event::{
        CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventType,
    },
};

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::car_maintenance_events)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct CarMaintenanceEventEntity {
    pub id: String,
    pub user_id: String,
    pub car_id: String,
    pub occurred_on: NaiveDate,
    pub event_type: String,
    pub odometer_miles: Option<i32>,
    pub cost_cents: Option<i64>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub document_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::car_maintenance_events)]
pub struct NewCarMaintenanceEventEntity {
    pub id: String,
    pub user_id: String,
    pub car_id: String,
    pub occurred_on: NaiveDate,
    pub event_type: String,
    pub odometer_miles: Option<i32>,
    pub cost_cents: Option<i64>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub document_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Mutable columns only. `car_id` and `user_id` stay fixed.
#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::car_maintenance_events)]
pub struct UpdateCarMaintenanceEventEntity {
    pub occurred_on: NaiveDate,
    pub event_type: String,
    #[diesel(treat_none_as_null = true)]
    pub odometer_miles: Option<i32>,
    #[diesel(treat_none_as_null = true)]
    pub cost_cents: Option<i64>,
    #[diesel(treat_none_as_null = true)]
    pub title: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub notes: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub document_id: Option<String>,
    pub updated_at: NaiveDateTime,
}

impl CarMaintenanceEventEntity {
    pub fn into_domain(self) -> Option<CarMaintenanceEvent> {
        let id = uuid::Uuid::parse_str(&self.id).ok()?;
        let user_id = uuid::Uuid::parse_str(&self.user_id).ok()?;
        let car_id = uuid::Uuid::parse_str(&self.car_id).ok()?;
        let event_type = CarMaintenanceEventType::parse(&self.event_type).ok()?;
        let document_id = match self.document_id {
            Some(raw) => Some(uuid::Uuid::parse_str(&raw).ok()?),
            None => None,
        };
        Some(CarMaintenanceEvent::with_id(
            CarMaintenanceEventId(id),
            user_id,
            CarId(car_id),
            self.occurred_on,
            event_type,
            self.odometer_miles,
            self.cost_cents,
            self.title,
            self.notes,
            document_id,
            self.created_at,
            self.updated_at,
        ))
    }
}

impl From<&CarMaintenanceEvent> for NewCarMaintenanceEventEntity {
    fn from(event: &CarMaintenanceEvent) -> Self {
        Self {
            id: event.id.to_string(),
            user_id: event.user_id.to_string(),
            car_id: event.car_id.to_string(),
            occurred_on: event.occurred_on,
            event_type: event.event_type.as_str().to_string(),
            odometer_miles: event.odometer_miles,
            cost_cents: event.cost_cents,
            title: event.title.clone(),
            notes: event.notes.clone(),
            document_id: event.document_id.map(|id| id.to_string()),
            created_at: event.created_at,
            updated_at: event.updated_at,
        }
    }
}

impl From<&CarMaintenanceEvent> for UpdateCarMaintenanceEventEntity {
    fn from(event: &CarMaintenanceEvent) -> Self {
        Self {
            occurred_on: event.occurred_on,
            event_type: event.event_type.as_str().to_string(),
            odometer_miles: event.odometer_miles,
            cost_cents: event.cost_cents,
            title: event.title.clone(),
            notes: event.notes.clone(),
            document_id: event.document_id.map(|id| id.to_string()),
            updated_at: event.updated_at,
        }
    }
}
