use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::health_reading_use_cases::HealthReadingUseCases,
    infrastructure::app_state::LifeManagerState,
};

/**
 `HealthReadingState` wraps use cases so handlers do not couple to full LifeManagerState.
*/
#[derive(Clone)]
pub struct HealthReadingState(pub Arc<HealthReadingUseCases>);

impl FromRef<LifeManagerState> for HealthReadingState {
    fn from_ref(state: &LifeManagerState) -> Self {
        HealthReadingState(state.health_reading_use_cases.clone())
    }
}
