use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        car::car_maintenance_event_documents_writer::CarMaintenanceEventDocumentsWriter,
        car::car_maintenance_event_repository::{
            CarMaintenanceEventRepository, MissingCarMaintenanceEvent,
        },
        car::create_car_maintenance_event_command::{
            ensure_no_receipt_conflict, receipt_document_id,
        },
        document::document_repository::DocumentRepository,
    },
    domain::{
        car::car_maintenance_event::{
            CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventInput,
            CarMaintenanceEventType,
        },
        document::Document,
    },
};

/// Updates mutable fields on an owned CarMaintenanceEvent.
///
/// `car_id` and ownership stay fixed. Inactive Cars are allowed (history
/// correction). Optional `document_id` must be an owned Document when set.
/// Optional `new_receipt_document` is created and linked in one transaction.
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
    new_receipt_document: Option<Document>,
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    document_repository: Arc<dyn DocumentRepository>,
    car_maintenance_event_documents_writer: Arc<dyn CarMaintenanceEventDocumentsWriter>,
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
        new_receipt_document: Option<Document>,
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
        document_repository: Arc<dyn DocumentRepository>,
        car_maintenance_event_documents_writer: Arc<dyn CarMaintenanceEventDocumentsWriter>,
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
            new_receipt_document,
            car_maintenance_event_repository,
            document_repository,
            car_maintenance_event_documents_writer,
        }
    }

    pub async fn execute(self) -> AppResult<CarMaintenanceEvent> {
        ensure_no_receipt_conflict(self.document_id, &self.new_receipt_document)?;
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
            document_id: receipt_document_id(self.document_id, &self.new_receipt_document),
        })?;

        let updated = match self.new_receipt_document {
            None => self.car_maintenance_event_repository.update(event).await,
            Some(receipt) => {
                self.car_maintenance_event_documents_writer
                    .update(event, vec![receipt])
                    .await
            }
        };
        match updated {
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
