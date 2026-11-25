use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::{
        car::car_documents_writer::CarDocumentsWriter,
        car::car_repository::CarRepository,
        car::create_car_command::{
            ensure_unique_identity, map_car_write_error, new_documents_to_create,
            verify_owned_document_links,
        },
        car::document_link::DocumentLink,
        document::document_repository::DocumentRepository,
    },
    domain::car::{Car, CarId, CarProfileInput},
};

pub struct UpdateCarCommand {
    car_id: CarId,
    user_id: Uuid,
    display_name: Option<Option<String>>,
    make: String,
    model: String,
    year: i32,
    vin: Option<Option<String>>,
    license_plate: Option<Option<String>>,
    notes: Option<Option<String>>,
    /// Replaces the stored insurance link.
    insurance_document: DocumentLink,
    /// Replaces the stored registration link.
    registration_document: DocumentLink,
    /// When set, reactivate (`true`) or deactivate (`false`). When `None`, leave active state.
    active: Option<bool>,
    car_repository: Arc<dyn CarRepository>,
    document_repository: Arc<dyn DocumentRepository>,
    car_documents_writer: Arc<dyn CarDocumentsWriter>,
}

impl UpdateCarCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        car_id: CarId,
        user_id: Uuid,
        display_name: Option<Option<String>>,
        make: String,
        model: String,
        year: i32,
        vin: Option<Option<String>>,
        license_plate: Option<Option<String>>,
        notes: Option<Option<String>>,
        insurance_document: DocumentLink,
        registration_document: DocumentLink,
        active: Option<bool>,
        car_repository: Arc<dyn CarRepository>,
        document_repository: Arc<dyn DocumentRepository>,
        car_documents_writer: Arc<dyn CarDocumentsWriter>,
    ) -> Self {
        Self {
            car_id,
            user_id,
            display_name,
            make,
            model,
            year,
            vin,
            license_plate,
            notes,
            insurance_document,
            registration_document,
            active,
            car_repository,
            document_repository,
            car_documents_writer,
        }
    }

    pub async fn execute(self) -> AppResult<Car> {
        let Some(mut car) = self
            .car_repository
            .load_owned(&self.car_id, &self.user_id)
            .await
        else {
            return Err(AppError::NotFound);
        };

        let display_name = match &self.display_name {
            None => car.display_name.clone(),
            Some(v) => v.clone(),
        };
        let vin = match &self.vin {
            None => car.vin.clone(),
            Some(v) => v.clone(),
        };
        let license_plate = match &self.license_plate {
            None => car.license_plate.clone(),
            Some(v) => v.clone(),
        };
        let notes = match &self.notes {
            None => car.notes.clone(),
            Some(v) => v.clone(),
        };
        verify_owned_document_links(
            &self.document_repository,
            &self.user_id,
            (&self.insurance_document, car.insurance_document_id),
            (&self.registration_document, car.registration_document_id),
        )
        .await?;

        car.update_profile(CarProfileInput {
            display_name: display_name.as_deref(),
            make: &self.make,
            model: &self.model,
            year: self.year,
            vin: vin.as_deref(),
            license_plate: license_plate.as_deref(),
            notes: notes.as_deref(),
            insurance_document_id: self.insurance_document.linked_id(),
            registration_document_id: self.registration_document.linked_id(),
        })?;

        match self.active {
            Some(true) => car.reactivate(),
            Some(false) => car.deactivate(),
            None => {}
        }

        ensure_unique_identity(&self.car_repository, &car, Some(&car.id)).await?;

        let new_documents =
            new_documents_to_create(self.insurance_document, self.registration_document);
        let updated = if new_documents.is_empty() {
            self.car_repository.update(car).await
        } else {
            self.car_documents_writer.update(car, new_documents).await
        };
        updated.map_err(|e| map_car_write_error(e, "updating"))
    }
}
