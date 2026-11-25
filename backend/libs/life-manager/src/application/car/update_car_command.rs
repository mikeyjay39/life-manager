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
    /// `None` keeps the stored link. `Some` replaces it.
    insurance_document: Option<DocumentLink>,
    /// `None` keeps the stored link. `Some` replaces it.
    registration_document: Option<DocumentLink>,
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
        insurance_document: Option<DocumentLink>,
        registration_document: Option<DocumentLink>,
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
        let insurance_document_id =
            resolve_document_link(self.insurance_document.as_ref(), car.insurance_document_id);
        let registration_document_id = resolve_document_link(
            self.registration_document.as_ref(),
            car.registration_document_id,
        );

        // Only a newly linked id needs an ownership check. Keep must not re-check:
        // a later Document hard-delete must not block unrelated Car field updates.
        verify_owned_document_links(
            &self.document_repository,
            &self.user_id,
            self.insurance_document.as_ref(),
            self.registration_document.as_ref(),
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
            insurance_document_id,
            registration_document_id,
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

/// Keep (`None`) leaves the stored id. Otherwise the link gives the new id.
fn resolve_document_link(link: Option<&DocumentLink>, stored: Option<Uuid>) -> Option<Uuid> {
    match link {
        None => stored,
        Some(link) => link.linked_id(),
    }
}
