use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::health_member_use_cases::HealthMemberUseCases,
    infrastructure::app_state::LifeManagerState,
};

/**
 `HealthMemberState` wraps use cases so handlers do not couple to full LifeManagerState.
*/
#[derive(Clone)]
pub struct HealthMemberState(pub Arc<HealthMemberUseCases>);

impl FromRef<LifeManagerState> for HealthMemberState {
    fn from_ref(state: &LifeManagerState) -> Self {
        HealthMemberState(state.health_member_use_cases.clone())
    }
}
