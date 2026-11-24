use async_trait::async_trait;

use crate::domain::{car::car_maintenance_event::CarMaintenanceEvent, document::Document};

/**
 * Write-only port: stores a CarMaintenanceEvent and the new Documents that it
 * links, in one transaction.
 *
 * This is an explicit exception to "one aggregate per transaction". The event
 * and Document stay separate aggregates with their own repositories. An event
 * write that creates its receipt Document must be atomic, so a failed event
 * write leaves no orphan Document. Both aggregates live in one bounded context
 * and one SQLite database, so one local transaction gives strong consistency.
 *
 * Errors are the `CarMaintenanceEventRepository` errors
 * (`MissingCarForMaintenanceEvent`, `InactiveCarForMaintenanceEvent`,
 * `MissingCarMaintenanceEvent`). Any error rolls back the new Documents and
 * their tag links.
 */
#[async_trait]
pub trait CarMaintenanceEventDocumentsWriter: Sync + Send {
    /// Checks that the Car is active, inserts `new_documents`, then inserts `event`.
    async fn create(
        &self,
        event: CarMaintenanceEvent,
        new_documents: Vec<Document>,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>>;

    /// Inserts `new_documents`, then updates `event`. No active-Car check.
    async fn update(
        &self,
        event: CarMaintenanceEvent,
        new_documents: Vec<Document>,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>>;
}
