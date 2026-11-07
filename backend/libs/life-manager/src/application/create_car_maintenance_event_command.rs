use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        car_maintenance_event_repository::{
            CarMaintenanceEventRepository, InactiveCarForMaintenanceEvent,
            MissingCarForMaintenanceEvent,
        },
        car_repository::CarRepository,
        document_repository::DocumentRepository,
    },
    domain::{
        car::CarId,
        car_maintenance_event::{
            CarMaintenanceEvent, CarMaintenanceEventInput, CarMaintenanceEventType,
        },
    },
};

pub struct CreateCarMaintenanceEventCommand {
    user_id: Uuid,
    car_id: CarId,
    occurred_on: NaiveDate,
    event_type: CarMaintenanceEventType,
    odometer_miles: Option<i32>,
    cost_cents: Option<i64>,
    title: Option<String>,
    notes: Option<String>,
    document_id: Option<Uuid>,
    car_repository: Arc<dyn CarRepository>,
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    document_repository: Arc<dyn DocumentRepository>,
}

impl CreateCarMaintenanceEventCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        user_id: Uuid,
        car_id: CarId,
        occurred_on: NaiveDate,
        event_type: CarMaintenanceEventType,
        odometer_miles: Option<i32>,
        cost_cents: Option<i64>,
        title: Option<String>,
        notes: Option<String>,
        document_id: Option<Uuid>,
        car_repository: Arc<dyn CarRepository>,
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
        document_repository: Arc<dyn DocumentRepository>,
    ) -> Self {
        Self {
            user_id,
            car_id,
            occurred_on,
            event_type,
            odometer_miles,
            cost_cents,
            title,
            notes,
            document_id,
            car_repository,
            car_maintenance_event_repository,
            document_repository,
        }
    }

    pub async fn execute(self) -> AppResult<CarMaintenanceEvent> {
        if let Some(doc_id) = self.document_id
            && self
                .document_repository
                .load_owned_document(&doc_id, &self.user_id)
                .await
                .is_none()
        {
            return Err(AppError::Validation(
                "document_id must reference an owned Document".to_string(),
            ));
        }

        let car = self
            .car_repository
            .load_owned(&self.car_id, &self.user_id)
            .await
            .ok_or(AppError::NotFound)?;

        let event = CarMaintenanceEvent::create(
            &car,
            CarMaintenanceEventInput {
                occurred_on: self.occurred_on,
                event_type: self.event_type,
                odometer_miles: self.odometer_miles,
                cost_cents: self.cost_cents,
                title: self.title.as_deref(),
                notes: self.notes.as_deref(),
                document_id: self.document_id,
            },
        )?;

        match self.car_maintenance_event_repository.save(event).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<InactiveCarForMaintenanceEvent>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<MissingCarForMaintenanceEvent>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error saving CarMaintenanceEvent: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
