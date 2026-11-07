use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::Serialize;

use crate::domain::car::{Car, CarId};

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::cars)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct CarEntity {
    pub id: String,
    pub user_id: String,
    pub display_name: Option<String>,
    pub make: String,
    pub model: String,
    pub year: i32,
    pub vin: Option<String>,
    pub license_plate: Option<String>,
    pub notes: Option<String>,
    pub insurance_document_id: Option<String>,
    pub registration_document_id: Option<String>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::cars)]
pub struct NewCarEntity {
    pub id: String,
    pub user_id: String,
    pub display_name: Option<String>,
    pub make: String,
    pub model: String,
    pub year: i32,
    pub vin: Option<String>,
    pub license_plate: Option<String>,
    pub notes: Option<String>,
    pub insurance_document_id: Option<String>,
    pub registration_document_id: Option<String>,
    pub active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub deactivated_at: Option<NaiveDateTime>,
}

#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::cars)]
pub struct UpdateCarEntity {
    #[diesel(treat_none_as_null = true)]
    pub display_name: Option<String>,
    pub make: String,
    pub model: String,
    pub year: i32,
    #[diesel(treat_none_as_null = true)]
    pub vin: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub license_plate: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub notes: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub insurance_document_id: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub registration_document_id: Option<String>,
    pub active: bool,
    pub updated_at: NaiveDateTime,
    #[diesel(treat_none_as_null = true)]
    pub deactivated_at: Option<NaiveDateTime>,
}

impl CarEntity {
    pub fn into_domain(self) -> Option<Car> {
        let id = uuid::Uuid::parse_str(&self.id).ok()?;
        let user_id = uuid::Uuid::parse_str(&self.user_id).ok()?;
        let insurance_document_id = match self.insurance_document_id {
            None => None,
            Some(s) => Some(uuid::Uuid::parse_str(&s).ok()?),
        };
        let registration_document_id = match self.registration_document_id {
            None => None,
            Some(s) => Some(uuid::Uuid::parse_str(&s).ok()?),
        };
        Some(Car::with_id(
            CarId(id),
            user_id,
            self.display_name,
            self.make,
            self.model,
            self.year,
            self.vin,
            self.license_plate,
            self.notes,
            insurance_document_id,
            registration_document_id,
            self.active,
            self.created_at,
            self.updated_at,
            self.deactivated_at,
        ))
    }
}

impl From<&Car> for NewCarEntity {
    fn from(car: &Car) -> Self {
        Self {
            id: car.id.to_string(),
            user_id: car.user_id.to_string(),
            display_name: car.display_name.clone(),
            make: car.make.clone(),
            model: car.model.clone(),
            year: car.year,
            vin: car.vin.clone(),
            license_plate: car.license_plate.clone(),
            notes: car.notes.clone(),
            insurance_document_id: car.insurance_document_id.map(|id| id.to_string()),
            registration_document_id: car.registration_document_id.map(|id| id.to_string()),
            active: car.active,
            created_at: car.created_at,
            updated_at: car.updated_at,
            deactivated_at: car.deactivated_at,
        }
    }
}

impl From<&Car> for UpdateCarEntity {
    fn from(car: &Car) -> Self {
        Self {
            display_name: car.display_name.clone(),
            make: car.make.clone(),
            model: car.model.clone(),
            year: car.year,
            vin: car.vin.clone(),
            license_plate: car.license_plate.clone(),
            notes: car.notes.clone(),
            insurance_document_id: car.insurance_document_id.map(|id| id.to_string()),
            registration_document_id: car.registration_document_id.map(|id| id.to_string()),
            active: car.active,
            updated_at: car.updated_at,
            deactivated_at: car.deactivated_at,
        }
    }
}
