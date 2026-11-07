use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::car::Car;

#[derive(Serialize, Deserialize, Clone, Debug, TS, PartialEq, Eq)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/CarDto.ts"
)]
pub struct CarDto {
    pub id: Uuid,
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

impl CarDto {
    pub fn from_domain(car: &Car) -> Self {
        Self {
            id: car.id.0,
            display_name: car.display_name.clone(),
            make: car.make.clone(),
            model: car.model.clone(),
            year: car.year,
            vin: car.vin.clone(),
            license_plate: car.license_plate.clone(),
            notes: car.notes.clone(),
            insurance_document_id: car.insurance_document_id,
            registration_document_id: car.registration_document_id,
            active: car.active,
            created_at: car.created_at,
            updated_at: car.updated_at,
            deactivated_at: car.deactivated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::car::{Car, CarProfileInput};
    use uuid::Uuid;

    #[test]
    fn given_domain_car_when_to_dto_then_omits_user_id() {
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
        let dto = CarDto::from_domain(&car);
        assert_eq!(dto.id, car.id.0);
        assert_eq!(dto.make, "Toyota");
        assert!(dto.active);
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn export_typescript_bindings() {
        CarDto::export().unwrap();
    }
}
