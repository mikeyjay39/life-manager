use backend_utils::AppError;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::car_maintenance_event::CarMaintenanceEventType;

#[derive(Deserialize, Serialize, Clone, Debug, TS)]
#[ts(
    export,
    rename = "CreateCarMaintenanceEventCommand",
    export_to = "../../../../frontend/lib/api/generated/life-manager/CreateCarMaintenanceEventCommand.ts"
)]
pub struct CreateCarMaintenanceEventCommandDto {
    pub car_id: Uuid,
    pub occurred_on: NaiveDate,
    pub event_type: String,
    #[serde(default)]
    pub odometer_miles: Option<i32>,
    #[serde(default)]
    pub cost_cents: Option<i64>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub document_id: Option<Uuid>,
}

impl CreateCarMaintenanceEventCommandDto {
    pub fn parse_event_type(&self) -> Result<CarMaintenanceEventType, AppError> {
        CarMaintenanceEventType::parse(&self.event_type)
    }
}

#[derive(Deserialize, Debug, Serialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/life-manager/GetCarMaintenanceEventsQueryParams.ts"
)]
pub struct GetCarMaintenanceEventsQueryParams {
    pub car_id: Option<Uuid>,
    #[serde(default)]
    pub from: Option<NaiveDate>,
    #[serde(default)]
    pub to: Option<NaiveDate>,
    #[serde(default)]
    pub event_type: Option<String>,
}

impl GetCarMaintenanceEventsQueryParams {
    pub fn parse_event_type(&self) -> Result<Option<CarMaintenanceEventType>, AppError> {
        match &self.event_type {
            None => Ok(None),
            Some(raw) => Ok(Some(CarMaintenanceEventType::parse(raw)?)),
        }
    }
}

#[cfg(test)]
mod export_ts_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        CreateCarMaintenanceEventCommandDto::export().unwrap();
        GetCarMaintenanceEventsQueryParams::export().unwrap();
    }
}
