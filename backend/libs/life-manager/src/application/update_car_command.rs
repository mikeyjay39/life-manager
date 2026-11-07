use std::sync::Arc;

use backend_utils::{AppError, AppResult};
use uuid::Uuid;

use crate::{
    application::{
        car_repository::{CarRepository, DuplicateCarLicensePlate, DuplicateCarVin},
        create_car_command::{ensure_unique_identity, verify_owned_document_links},
        document_repository::DocumentRepository,
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
    car_repository: Arc<dyn CarRepository>,
    document_repository: Arc<dyn DocumentRepository>,
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
        car_repository: Arc<dyn CarRepository>,
        document_repository: Arc<dyn DocumentRepository>,
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
            car_repository,
            document_repository,
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
        let insurance_document_id = match self.insurance_document_id {
            None => car.insurance_document_id,
            Some(v) => v,
        };
        let registration_document_id = match self.registration_document_id {
            None => car.registration_document_id,
            Some(v) => v,
        };

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

        match self.car_repository.update(car).await {
            Ok(saved) => Ok(saved),
            Err(e) => {
                if e.downcast_ref::<DuplicateCarVin>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                if e.downcast_ref::<DuplicateCarLicensePlate>().is_some() {
                    return Err(AppError::Validation(e.to_string()));
                }
                tracing::error!("Error updating Car: {}", e);
                Err(AppError::from(e))
            }
        }
    }
}
