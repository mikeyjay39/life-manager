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
        car::create_car_maintenance_event_command::verify_owned_receipt,
        car::document_link::DocumentLink,
        document::document_repository::DocumentRepository,
    },
    domain::car::car_maintenance_event::{
        CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventInput,
        CarMaintenanceEventType,
    },
};

/// Updates mutable fields on an owned CarMaintenanceEvent.
///
/// `car_id` and ownership stay fixed. Inactive Cars are allowed (history
/// correction). A linked receipt must be an owned Document. A new receipt is
/// created and linked in one transaction.
pub struct UpdateCarMaintenanceEventCommand {
    event_id: CarMaintenanceEventId,
    user_id: Uuid,
    occurred_on: NaiveDate,
    event_type: CarMaintenanceEventType,
    odometer_miles: Option<i32>,
    cost_cents: Option<i64>,
    title: Option<String>,
    notes: Option<String>,
    receipt_document: DocumentLink,
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
        receipt_document: DocumentLink,
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
            receipt_document,
            car_maintenance_event_repository,
            document_repository,
            car_maintenance_event_documents_writer,
        }
    }

    pub async fn execute(self) -> AppResult<CarMaintenanceEvent> {
        verify_owned_receipt(
            &self.document_repository,
            &self.user_id,
            &self.receipt_document,
        )
        .await?;

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
            document_id: self.receipt_document.linked_id(),
        })?;

        let updated = match self.receipt_document {
            DocumentLink::New(receipt) => {
                self.car_maintenance_event_documents_writer
                    .update(event, vec![receipt.into_document()])
                    .await
            }
            DocumentLink::None | DocumentLink::Existing(_) => {
                self.car_maintenance_event_repository.update(event).await
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
