use std::sync::Arc;

use axum::extract::FromRef;

use crate::{
    application::doctor_visit_use_cases::DoctorVisitUseCases,
    infrastructure::app_state::LifeManagerState,
};

/**
 `DoctorVisitState` wraps use cases so handlers do not couple to full LifeManagerState.
*/
#[derive(Clone)]
pub struct DoctorVisitState(pub Arc<DoctorVisitUseCases>);

impl FromRef<LifeManagerState> for DoctorVisitState {
    fn from_ref(state: &LifeManagerState) -> Self {
        DoctorVisitState(state.doctor_visit_use_cases.clone())
    }
}
