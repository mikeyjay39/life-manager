use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::{
        car::car_documents_writer::CarDocumentsWriter,
        car::car_repository::{
            CarRepository, DuplicateCarLicensePlate, DuplicateCarVin, MissingCar,
        },
        car::document_link::DocumentLink,
        document::document_repository::DocumentRepository,
    },
    domain::{
        car::{Car, CarProfileInput},
        document::Document,
    },
};

pub struct CreateCarCommand {
    user_id: Uuid,
    display_name: Option<String>,
    make: String,
    model: String,
    year: i32,
    vin: Option<String>,
    license_plate: Option<String>,
    notes: Option<String>,
    insurance_document: DocumentLink,
    registration_document: DocumentLink,
    car_repository: Arc<dyn CarRepository>,
    document_repository: Arc<dyn DocumentRepository>,
    car_documents_writer: Arc<dyn CarDocumentsWriter>,
}

impl CreateCarCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        user_id: Uuid,
        display_name: Option<String>,
        make: String,
        model: String,
        year: i32,
        vin: Option<String>,
        license_plate: Option<String>,
        notes: Option<String>,
        insurance_document: DocumentLink,
        registration_document: DocumentLink,
        car_repository: Arc<dyn CarRepository>,
        document_repository: Arc<dyn DocumentRepository>,
        car_documents_writer: Arc<dyn CarDocumentsWriter>,
    ) -> Self {
        Self {
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
            car_repository,
            document_repository,
            car_documents_writer,
        }
    }

    pub async fn execute(self) -> AppResult<Car> {
        verify_owned_document_links(
            &self.document_repository,
            &self.user_id,
            (&self.insurance_document, None),
            (&self.registration_document, None),
        )
        .await?;

        let car = Car::create(
            self.user_id,
            CarProfileInput {
                display_name: self.display_name.as_deref(),
                make: &self.make,
                model: &self.model,
                year: self.year,
                vin: self.vin.as_deref(),
                license_plate: self.license_plate.as_deref(),
                notes: self.notes.as_deref(),
                insurance_document_id: self.insurance_document.linked_id(),
                registration_document_id: self.registration_document.linked_id(),
            },
        )?;

        ensure_unique_identity(&self.car_repository, &car, None).await?;

        let new_documents =
            new_documents_to_create(self.insurance_document, self.registration_document);
        let saved = if new_documents.is_empty() {
            self.car_repository.save(car).await
        } else {
            self.car_documents_writer.create(car, new_documents).await
        };
        saved.map_err(|e| map_car_write_error(e, "saving"))
    }
}

/// Maps a Car write error to the API error. Duplicates are validation errors.
/// A Car row removed after load is not found.
pub(crate) fn map_car_write_error(e: Box<dyn std::error::Error>, context: &str) -> AppError {
    if e.downcast_ref::<MissingCar>().is_some() {
        return AppError::NotFound;
    }
    if e.downcast_ref::<DuplicateCarVin>().is_some()
        || e.downcast_ref::<DuplicateCarLicensePlate>().is_some()
    {
        return AppError::Validation(e.to_string());
    }
    tracing::error!("Error {} Car: {}", context, e);
    AppError::from(e)
}

/// Rejects a newly linked Document id that the user does not own. Each role
/// is the link and the id that the Car stores now (`None` on create).
///
/// An `Existing` id equal to the stored id is not checked again: a later
/// Document hard-delete must not block unrelated Car field updates. No link and
/// new Documents need no check.
pub(crate) async fn verify_owned_document_links(
    document_repository: &Arc<dyn DocumentRepository>,
    user_id: &Uuid,
    insurance_document: (&DocumentLink, Option<Uuid>),
    registration_document: (&DocumentLink, Option<Uuid>),
) -> AppResult<()> {
    for (label, (link, stored_id)) in [
        ("insurance_document_id", insurance_document),
        ("registration_document_id", registration_document),
    ] {
        let DocumentLink::Existing(existing) = link else {
            continue;
        };
        if stored_id == Some(existing.id()) {
            continue;
        }
        if document_repository
            .load_owned_document(&existing.id(), user_id)
            .await
            .is_none()
        {
            return Err(AppError::Validation(format!(
                "{label} must reference an owned Document"
            )));
        }
    }
    Ok(())
}

/// The new Documents to create in the same transaction as the Car write.
pub(crate) fn new_documents_to_create(
    insurance_document: DocumentLink,
    registration_document: DocumentLink,
) -> Vec<Document> {
    [insurance_document, registration_document]
        .into_iter()
        .filter_map(|link| match link {
            DocumentLink::New(new) => Some(new.into_document()),
            DocumentLink::None | DocumentLink::Existing(_) => None,
        })
        .collect()
}

pub(crate) async fn ensure_unique_identity(
    car_repository: &Arc<dyn CarRepository>,
    car: &Car,
    exclude_id: Option<&crate::domain::car::CarId>,
) -> AppResult<()> {
    if let Some(vin) = &car.vin
        && car_repository
            .find_owned_by_vin(&car.user_id, vin, exclude_id)
            .await
            .is_some()
    {
        return Err(AppError::Validation(DuplicateCarVin.to_string()));
    }
    if let Some(plate) = &car.license_plate
        && car_repository
            .find_owned_by_license_plate(&car.user_id, plate, exclude_id)
            .await
            .is_some()
    {
        return Err(AppError::Validation(DuplicateCarLicensePlate.to_string()));
    }
    Ok(())
}
