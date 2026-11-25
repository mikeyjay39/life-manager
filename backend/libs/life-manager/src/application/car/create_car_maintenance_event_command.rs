use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::{
    application::{
        car::car_maintenance_event_documents_writer::CarMaintenanceEventDocumentsWriter,
        car::car_maintenance_event_repository::{
            CarMaintenanceEventRepository, InactiveCarForMaintenanceEvent,
            MissingCarForMaintenanceEvent,
        },
        car::car_repository::CarRepository,
        car::document_link::DocumentLink,
        document::document_repository::DocumentRepository,
    },
    domain::{
        car::CarId,
        car::car_maintenance_event::{
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
    receipt_document: DocumentLink,
    car_repository: Arc<dyn CarRepository>,
    car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
    document_repository: Arc<dyn DocumentRepository>,
    car_maintenance_event_documents_writer: Arc<dyn CarMaintenanceEventDocumentsWriter>,
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
        receipt_document: DocumentLink,
        car_repository: Arc<dyn CarRepository>,
        car_maintenance_event_repository: Arc<dyn CarMaintenanceEventRepository>,
        document_repository: Arc<dyn DocumentRepository>,
        car_maintenance_event_documents_writer: Arc<dyn CarMaintenanceEventDocumentsWriter>,
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
            receipt_document,
            car_repository,
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
                document_id: self.receipt_document.linked_id(),
            },
        )?;

        let saved = match self.receipt_document {
            DocumentLink::New(receipt) => {
                self.car_maintenance_event_documents_writer
                    .create(event, vec![receipt.into_document()])
                    .await
            }
            DocumentLink::None | DocumentLink::Existing(_) => {
                self.car_maintenance_event_repository.save(event).await
            }
        };
        match saved {
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

/// Rejects a linked receipt id that the user does not own. A new receipt needs
/// no check: the command creates it for the user.
pub(crate) async fn verify_owned_receipt(
    document_repository: &Arc<dyn DocumentRepository>,
    user_id: &Uuid,
    receipt_document: &DocumentLink,
) -> AppResult<()> {
    let DocumentLink::Existing(existing) = receipt_document else {
        return Ok(());
    };
    if document_repository
        .load_owned_document(&existing.id(), user_id)
        .await
        .is_none()
    {
        return Err(AppError::Validation(
            "document_id must reference an owned Document".to_string(),
        ));
    }
    Ok(())
}
