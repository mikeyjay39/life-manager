use async_trait::async_trait;

use crate::domain::{car::Car, document::Document};

/**
 * Write-only port: stores a Car and the new Documents that it links, in one
 * transaction.
 *
 * This is an explicit exception to "one aggregate per transaction". Car and
 * Document stay separate aggregates with their own repositories. A Car write
 * that creates its linked Documents must be atomic, so a failed Car write
 * leaves no orphan Document. Both aggregates live in one bounded context and
 * one SQLite database, so one local transaction gives strong consistency.
 *
 * Errors are the `CarRepository` errors (`DuplicateCarVin`,
 * `DuplicateCarLicensePlate`, `MissingCar`). Any error rolls back the new
 * Documents and their tag links.
 */
#[async_trait]
pub trait CarDocumentsWriter: Sync + Send {
    /// Inserts `new_documents`, then inserts `car`.
    async fn create(
        &self,
        car: Car,
        new_documents: Vec<Document>,
    ) -> Result<Car, Box<dyn std::error::Error>>;

    /// Inserts `new_documents`, then updates `car`. A missing Car row is `MissingCar`.
    async fn update(
        &self,
        car: Car,
        new_documents: Vec<Document>,
    ) -> Result<Car, Box<dyn std::error::Error>>;
}
