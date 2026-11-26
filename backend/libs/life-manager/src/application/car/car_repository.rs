use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::car::{Car, CarId};

/**
 * Port for Car persistence.
 *
 * Ownership: callers that mutate must use `load_owned` so other users see not-found.
 * VIN and license_plate uniqueness are per `user_id` when the value is non-null.
 */
#[async_trait]
pub trait CarRepository: Sync + Send {
    async fn get_by_id(&self, id: &CarId) -> Option<Car>;

    /// Lists cars owned by `user_id`. When `include_inactive` is false, only active rows.
    async fn list_by_owner(&self, user_id: &Uuid, include_inactive: bool) -> Vec<Car>;

    async fn save(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>>;

    async fn update(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>>;

    async fn delete(&self, id: &CarId) -> Result<(), Box<dyn std::error::Error>>;

    /// Returns the car only when `user_id` owns it.
    async fn load_owned(&self, id: &CarId, user_id: &Uuid) -> Option<Car>;

    /// Finds another owned car with the same non-empty VIN (excludes `exclude_id` when set).
    async fn find_owned_by_vin(
        &self,
        user_id: &Uuid,
        vin: &str,
        exclude_id: Option<&CarId>,
    ) -> Option<Car>;

    /// Finds another owned car with the same non-empty license plate (excludes `exclude_id`).
    async fn find_owned_by_license_plate(
        &self,
        user_id: &Uuid,
        license_plate: &str,
        exclude_id: Option<&CarId>,
    ) -> Option<Car>;
}

/// Raised when VIN uniqueness fails (same user).
#[derive(Debug)]
pub struct DuplicateCarVin;

impl std::fmt::Display for DuplicateCarVin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "a car with this VIN already exists for this user")
    }
}

impl std::error::Error for DuplicateCarVin {}

/// Raised when license_plate uniqueness fails (same user).
#[derive(Debug)]
pub struct DuplicateCarLicensePlate;

impl std::fmt::Display for DuplicateCarLicensePlate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "a car with this license plate already exists for this user"
        )
    }
}

impl std::error::Error for DuplicateCarLicensePlate {}

/// Raised when delete targets a missing row.
#[derive(Debug)]
pub struct MissingCar;

impl std::fmt::Display for MissingCar {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "car not found")
    }
}

impl std::error::Error for MissingCar {}

#[cfg(test)]
pub(crate) mod tests {
    use tokio::sync::Mutex;

    use super::*;

    /// In-memory `CarRepository` for tests in any layer.
    pub(crate) struct CarCollection {
        pub(crate) cars: Mutex<Vec<Car>>,
    }

    impl CarCollection {
        pub(crate) fn new() -> Self {
            Self {
                cars: Mutex::new(Vec::new()),
            }
        }
    }

    impl Default for CarCollection {
        fn default() -> Self {
            Self::new()
        }
    }

    #[async_trait]
    impl CarRepository for CarCollection {
        async fn get_by_id(&self, id: &CarId) -> Option<Car> {
            self.cars.lock().await.iter().find(|c| c.id == *id).cloned()
        }

        async fn list_by_owner(&self, user_id: &Uuid, include_inactive: bool) -> Vec<Car> {
            let mut cars: Vec<Car> = self
                .cars
                .lock()
                .await
                .iter()
                .filter(|c| c.user_id == *user_id)
                .filter(|c| include_inactive || c.active)
                .cloned()
                .collect();
            cars.sort_by(|a, b| {
                a.make
                    .cmp(&b.make)
                    .then_with(|| a.model.cmp(&b.model))
                    .then_with(|| a.year.cmp(&b.year))
                    .then_with(|| a.id.0.cmp(&b.id.0))
            });
            cars
        }

        async fn save(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>> {
            if let Some(vin) = &car.vin
                && self
                    .find_owned_by_vin(&car.user_id, vin, None)
                    .await
                    .is_some()
            {
                return Err(Box::new(DuplicateCarVin));
            }
            if let Some(plate) = &car.license_plate
                && self
                    .find_owned_by_license_plate(&car.user_id, plate, None)
                    .await
                    .is_some()
            {
                return Err(Box::new(DuplicateCarLicensePlate));
            }
            self.cars.lock().await.push(car.clone());
            Ok(car)
        }

        async fn update(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>> {
            if let Some(vin) = &car.vin
                && self
                    .find_owned_by_vin(&car.user_id, vin, Some(&car.id))
                    .await
                    .is_some()
            {
                return Err(Box::new(DuplicateCarVin));
            }
            if let Some(plate) = &car.license_plate
                && self
                    .find_owned_by_license_plate(&car.user_id, plate, Some(&car.id))
                    .await
                    .is_some()
            {
                return Err(Box::new(DuplicateCarLicensePlate));
            }
            let mut cars = self.cars.lock().await;
            let index = cars
                .iter()
                .position(|c| c.id == car.id)
                .ok_or("Car not found")?;
            cars[index] = car.clone();
            Ok(car)
        }

        async fn delete(&self, id: &CarId) -> Result<(), Box<dyn std::error::Error>> {
            let mut cars = self.cars.lock().await;
            let index = cars.iter().position(|c| c.id == *id).ok_or(MissingCar)?;
            cars.remove(index);
            Ok(())
        }

        async fn load_owned(&self, id: &CarId, user_id: &Uuid) -> Option<Car> {
            self.cars
                .lock()
                .await
                .iter()
                .find(|c| c.id == *id && c.user_id == *user_id)
                .cloned()
        }

        async fn find_owned_by_vin(
            &self,
            user_id: &Uuid,
            vin: &str,
            exclude_id: Option<&CarId>,
        ) -> Option<Car> {
            self.cars
                .lock()
                .await
                .iter()
                .find(|c| {
                    c.user_id == *user_id
                        && c.vin.as_deref() == Some(vin)
                        && exclude_id.is_none_or(|ex| c.id != *ex)
                })
                .cloned()
        }

        async fn find_owned_by_license_plate(
            &self,
            user_id: &Uuid,
            license_plate: &str,
            exclude_id: Option<&CarId>,
        ) -> Option<Car> {
            self.cars
                .lock()
                .await
                .iter()
                .find(|c| {
                    c.user_id == *user_id
                        && c.license_plate.as_deref() == Some(license_plate)
                        && exclude_id.is_none_or(|ex| c.id != *ex)
                })
                .cloned()
        }
    }
}
