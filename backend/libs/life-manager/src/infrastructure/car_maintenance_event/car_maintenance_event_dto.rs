use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::car_maintenance_event::CarMaintenanceEvent;

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/CarMaintenanceEventDto.ts"
)]
pub struct CarMaintenanceEventDto {
    pub id: Uuid,
    pub car_id: Uuid,
    pub occurred_on: NaiveDate,
    pub event_type: String,
    pub odometer_miles: Option<i32>,
    pub cost_cents: Option<i64>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub document_id: Option<Uuid>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl CarMaintenanceEventDto {
    pub fn from_domain(event: &CarMaintenanceEvent) -> Self {
        Self {
            id: event.id.0,
            car_id: event.car_id.0,
            occurred_on: event.occurred_on,
            event_type: event.event_type.as_str().to_string(),
            odometer_miles: event.odometer_miles,
            cost_cents: event.cost_cents,
            title: event.title.clone(),
            notes: event.notes.clone(),
            document_id: event.document_id,
            created_at: event.created_at,
            updated_at: event.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        car::{Car, CarProfileInput},
        car_maintenance_event::{CarMaintenanceEventInput, CarMaintenanceEventType},
    };
    use chrono::Utc;

    #[test]
    fn given_domain_event_when_to_dto_then_omits_user_id() {
        let car = Car::create(
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
        .unwrap();
        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                occurred_on: Utc::now().date_naive(),
                event_type: CarMaintenanceEventType::OilChange,
                odometer_miles: Some(50_000),
                cost_cents: Some(5_999),
                title: None,
                notes: None,
                document_id: None,
            },
        )
        .unwrap();
        let dto = CarMaintenanceEventDto::from_domain(&event);
        assert_eq!(dto.car_id, car.id.0);
        assert_eq!(dto.event_type, "oil_change");
        assert_eq!(dto.cost_cents, Some(5_999));
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn export_typescript_bindings() {
        CarMaintenanceEventDto::export().unwrap();
    }
}
