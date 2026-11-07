use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use crate::domain::{
    car::CarId,
    car_maintenance_event::{CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventType},
};

/// Write rejected because the Car row is gone.
#[derive(Debug)]
pub struct MissingCarForMaintenanceEvent;

impl std::fmt::Display for MissingCarForMaintenanceEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Car not found for maintenance event save")
    }
}

impl std::error::Error for MissingCarForMaintenanceEvent {}

/// Write rejected because the Car is inactive.
#[derive(Debug)]
pub struct InactiveCarForMaintenanceEvent;

impl std::fmt::Display for InactiveCarForMaintenanceEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Car is inactive; reactivate before creating new maintenance events"
        )
    }
}

impl std::error::Error for InactiveCarForMaintenanceEvent {}

/**
 * Port for CarMaintenanceEvent persistence.
 *
 * Many events on the same date are allowed. There is no unique date key.
 * Callers that mutate must use `load_owned` so other users see not-found.
 */
#[async_trait]
pub trait CarMaintenanceEventRepository: Sync + Send {
    async fn get_by_id(&self, id: &CarMaintenanceEventId) -> Option<CarMaintenanceEvent>;

    /// Lists events for one Car owned by `user_id`, newest first.
    /// Optional `from` / `to` filter on `occurred_on` (inclusive).
    /// Optional `event_type` filter.
    async fn list_by_car(
        &self,
        car_id: &CarId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
        event_type: Option<CarMaintenanceEventType>,
    ) -> Vec<CarMaintenanceEvent>;

    async fn save(
        &self,
        event: CarMaintenanceEvent,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>>;

    /// Returns the event only when `user_id` owns it.
    async fn load_owned(
        &self,
        id: &CarMaintenanceEventId,
        user_id: &Uuid,
    ) -> Option<CarMaintenanceEvent>;
}
