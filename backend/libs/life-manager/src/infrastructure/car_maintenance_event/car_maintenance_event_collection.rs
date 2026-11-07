use async_trait::async_trait;
use chrono::NaiveDate;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    application::car_maintenance_event_repository::CarMaintenanceEventRepository,
    domain::{
        car::CarId,
        car_maintenance_event::{
            CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventType,
        },
    },
};

/// In-memory repository for unit tests.
pub struct CarMaintenanceEventCollection {
    pub events: Mutex<Vec<CarMaintenanceEvent>>,
}

impl CarMaintenanceEventCollection {
    pub fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
        }
    }
}

impl Default for CarMaintenanceEventCollection {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CarMaintenanceEventRepository for CarMaintenanceEventCollection {
    async fn get_by_id(&self, id: &CarMaintenanceEventId) -> Option<CarMaintenanceEvent> {
        self.events
            .lock()
            .await
            .iter()
            .find(|e| e.id == *id)
            .cloned()
    }

    async fn list_by_car(
        &self,
        car_id: &CarId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
        event_type: Option<CarMaintenanceEventType>,
    ) -> Vec<CarMaintenanceEvent> {
        let mut events: Vec<CarMaintenanceEvent> = self
            .events
            .lock()
            .await
            .iter()
            .filter(|e| e.car_id == *car_id && e.user_id == *user_id)
            .filter(|e| from.is_none_or(|f| e.occurred_on >= f))
            .filter(|e| to.is_none_or(|t| e.occurred_on <= t))
            .filter(|e| event_type.is_none_or(|ty| e.event_type == ty))
            .cloned()
            .collect();
        events.sort_by(|a, b| {
            b.occurred_on
                .cmp(&a.occurred_on)
                .then_with(|| b.created_at.cmp(&a.created_at))
                .then_with(|| b.id.0.cmp(&a.id.0))
        });
        events
    }

    async fn save(
        &self,
        event: CarMaintenanceEvent,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        self.events.lock().await.push(event.clone());
        Ok(event)
    }

    async fn load_owned(
        &self,
        id: &CarMaintenanceEventId,
        user_id: &Uuid,
    ) -> Option<CarMaintenanceEvent> {
        self.events
            .lock()
            .await
            .iter()
            .find(|e| e.id == *id && e.user_id == *user_id)
            .cloned()
    }
}
