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
        document::document_repository::DocumentRepository,
    },
    domain::{
        car::CarId,
        car::car_maintenance_event::{
            CarMaintenanceEvent, CarMaintenanceEventInput, CarMaintenanceEventType,
        },
        document::Document,
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
    new_receipt_document: Option<Document>,
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
        document_id: Option<Uuid>,
        new_receipt_document: Option<Document>,
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
            document_id,
            new_receipt_document,
            car_repository,
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
                document_id: receipt_document_id(self.document_id, &self.new_receipt_document),
            },
        )?;

        let saved = match self.new_receipt_document {
            None => self.car_maintenance_event_repository.save(event).await,
            Some(receipt) => {
                self.car_maintenance_event_documents_writer
                    .create(event, vec![receipt])
                    .await
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

/// Rejects a request that sets both `document_id` and `new_receipt_document`.
pub(crate) fn ensure_no_receipt_conflict(
    document_id: Option<Uuid>,
    new_receipt_document: &Option<Document>,
) -> AppResult<()> {
    if document_id.is_some() && new_receipt_document.is_some() {
        return Err(AppError::Validation(
            "set either document_id or new_receipt_document, not both".to_string(),
        ));
    }
    Ok(())
}

/// The new receipt Document id when one is sent, else the linked `document_id`.
pub(crate) fn receipt_document_id(
    document_id: Option<Uuid>,
    new_receipt_document: &Option<Document>,
) -> Option<Uuid> {
    new_receipt_document.as_ref().map(|d| d.id).or(document_id)
}
