use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::car_use_cases::CarUseCases,
    infrastructure::app_state::LifeManagerState,
};

/**
 `CarState` wraps use cases so handlers do not couple to full LifeManagerState.
*/
#[derive(Clone)]
pub struct CarState(pub Arc<CarUseCases>);

impl FromRef<LifeManagerState> for CarState {
    fn from_ref(state: &LifeManagerState) -> Self {
        CarState(state.car_use_cases.clone())
    }
}
