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
