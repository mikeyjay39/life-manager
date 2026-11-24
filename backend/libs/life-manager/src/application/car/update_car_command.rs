use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::{
        car::car_documents_writer::CarDocumentsWriter,
        car::car_repository::CarRepository,
        car::create_car_command::{
            NewCarDocuments, ensure_unique_identity, map_car_write_error,
            verify_owned_document_links,
        },
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
    insurance_document_id: Option<Option<Uuid>>,
    registration_document_id: Option<Option<Uuid>>,
    /// When set, reactivate (`true`) or deactivate (`false`). When `None`, leave active state.
    active: Option<bool>,
    new_documents: NewCarDocuments,
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
        insurance_document_id: Option<Option<Uuid>>,
        registration_document_id: Option<Option<Uuid>>,
        active: Option<bool>,
        new_documents: NewCarDocuments,
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
            insurance_document_id,
            registration_document_id,
            active,
            new_documents,
            car_repository,
            document_repository,
            car_documents_writer,
        }
    }

    pub async fn execute(self) -> AppResult<Car> {
        // Only a set id conflicts with a new Document. `null` (clear) and a new
        // Document for the same role means: link the new Document.
        self.new_documents.ensure_no_role_conflict(
            matches!(self.insurance_document_id, Some(Some(_))),
            matches!(self.registration_document_id, Some(Some(_))),
        )?;

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
        let insurance_document_id = resolve_document_link(
            self.new_documents.insurance_id(),
            self.insurance_document_id,
            car.insurance_document_id,
        );
        let registration_document_id = resolve_document_link(
            self.new_documents.registration_id(),
            self.registration_document_id,
            car.registration_document_id,
        );

        // Only verify Document ownership when the client sets a new id.
        // Omit (keep) must not re-check: a later Document hard-delete must not
        // block unrelated Car field updates. Clear (`null`) needs no check.
        let insurance_to_verify = match self.insurance_document_id {
            Some(Some(id)) => Some(id),
            _ => None,
        };
        let registration_to_verify = match self.registration_document_id {
            Some(Some(id)) => Some(id),
            _ => None,
        };
        verify_owned_document_links(
            &self.document_repository,
            &self.user_id,
            insurance_to_verify,
            registration_to_verify,
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

        let new_documents = self.new_documents.into_vec();
        let updated = if new_documents.is_empty() {
            self.car_repository.update(car).await
        } else {
            self.car_documents_writer.update(car, new_documents).await
        };
        updated.map_err(|e| map_car_write_error(e, "updating"))
    }
}

/// A new Document wins. Otherwise apply the PATCH rule: omit keeps the stored
/// id, `null` clears it, and a value sets it.
fn resolve_document_link(
    new_document_id: Option<Uuid>,
    patch: Option<Option<Uuid>>,
    stored: Option<Uuid>,
) -> Option<Uuid> {
    match (new_document_id, patch) {
        (Some(new_id), _) => Some(new_id),
        (None, None) => stored,
        (None, Some(value)) => value,
    }
}
