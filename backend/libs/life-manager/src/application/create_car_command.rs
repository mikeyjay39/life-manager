use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::{
        car_repository::{CarRepository, DuplicateCarLicensePlate, DuplicateCarVin},
        document_repository::DocumentRepository,
    },
    domain::car::{Car, CarProfileInput},
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
    insurance_document_id: Option<Uuid>,
    registration_document_id: Option<Uuid>,
    car_repository: Arc<dyn CarRepository>,
    document_repository: Arc<dyn DocumentRepository>,
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
        insurance_document_id: Option<Uuid>,
        registration_document_id: Option<Uuid>,
        car_repository: Arc<dyn CarRepository>,
        document_repository: Arc<dyn DocumentRepository>,
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
            insurance_document_id,
            registration_document_id,
            car_repository,
            document_repository,
        }
    }

    pub async fn execute(self) -> AppResult<Car> {
        verify_owned_document_links(
            &self.document_repository,
            &self.user_id,
            self.insurance_document_id,
            self.registration_document_id,
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
                insurance_document_id: self.insurance_document_id,
                registration_document_id: self.registration_document_id,
            },
        )?;

        ensure_unique_identity(&self.car_repository, &car, None).await?;

        match self.car_repository.save(car).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<DuplicateCarVin>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<DuplicateCarLicensePlate>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                tracing::error!("Error saving Car: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}

pub(crate) async fn verify_owned_document_links(
    document_repository: &Arc<dyn DocumentRepository>,
    user_id: &Uuid,
    insurance_document_id: Option<Uuid>,
    registration_document_id: Option<Uuid>,
) -> AppResult<()> {
    for (label, doc_id) in [
        ("insurance_document_id", insurance_document_id),
        ("registration_document_id", registration_document_id),
    ] {
        if let Some(id) = doc_id {
            if document_repository
                .load_owned_document(&id, user_id)
                .await
                .is_none()
            {
                return Err(AppError::Validation(format!(
                    "{label} must reference an owned Document"
                )));
            }
        }
    }
    Ok(())
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
