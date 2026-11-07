use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::car_maintenance_event_use_cases::CarMaintenanceEventUseCases,
    infrastructure::app_state::LifeManagerState,
};

/**
 `CarMaintenanceEventState` wraps use cases so handlers do not couple to full LifeManagerState.
*/
#[derive(Clone)]
pub struct CarMaintenanceEventState(pub Arc<CarMaintenanceEventUseCases>);

impl FromRef<LifeManagerState> for CarMaintenanceEventState {
    fn from_ref(state: &LifeManagerState) -> Self {
        CarMaintenanceEventState(state.car_maintenance_event_use_cases.clone())
    }
}
