use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        car_maintenance_event_repository::{
            CarMaintenanceEventRepository, MissingCarMaintenanceEvent,
        },
        document_repository::DocumentRepository,
    },
    domain::car_maintenance_event::{
        CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventInput,
        CarMaintenanceEventType,
    },
};

/// Updates mutable fields on an owned CarMaintenanceEvent.
///
/// `car_id` and ownership stay fixed. Inactive Cars are allowed (history
/// correction). Optional `document_id` must be an owned Document when set.
pub struct UpdateCarMaintenanceEventCommand {
    event_id: CarMaintenanceEventId,
    user_id: Uuid,
    occurred_on: NaiveDate,
    event_type: CarMaintenanceEventType,
    odometer_miles: Option<i32>,
    cost_cents: Option<i64>,
    title: Option<String>,
    notes: Option<String>,
    document_id: Option<Uuid>,
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    document_repository: Arc<dyn DocumentRepository>,
}

impl UpdateCarMaintenanceEventCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        event_id: CarMaintenanceEventId,
        user_id: Uuid,
        occurred_on: NaiveDate,
        event_type: CarMaintenanceEventType,
        odometer_miles: Option<i32>,
        cost_cents: Option<i64>,
        title: Option<String>,
        notes: Option<String>,
        document_id: Option<Uuid>,
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
        document_repository: Arc<dyn DocumentRepository>,
    ) -> Self {
        Self {
            event_id,
            user_id,
            occurred_on,
            event_type,
            odometer_miles,
            cost_cents,
            title,
            notes,
            document_id,
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

        let Some(mut event) = self
            .car_maintenance_event_repository
            .load_owned(&self.event_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        event.update(CarMaintenanceEventInput {
            occurred_on: self.occurred_on,
            event_type: self.event_type,
            odometer_miles: self.odometer_miles,
            cost_cents: self.cost_cents,
            title: self.title.as_deref(),
            notes: self.notes.as_deref(),
            document_id: self.document_id,
        })?;

        match self.car_maintenance_event_repository.update(event).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<MissingCarMaintenanceEvent>().is_some() {
                    return Err(AppError::NotFound);
                }
                tracing::error!("Error updating CarMaintenanceEvent: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
