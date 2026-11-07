use async_trait::async_trait;
use auth::auth_router;
use axum::Router;
use server_host::{AppBootstrap, TenantMount};

use crate::infrastructure::{
    app_state::{LifeManagerDeps, LifeManagerState, LifeManagerStateBuilder},
    car::car_router::car_router,
    car_maintenance_event::car_maintenance_event_router::car_maintenance_event_router,
    doctor_visit::doctor_visit_router::doctor_visit_router,
    document::document_router::document_router,
    health::health_reading_router::health_reading_router,
    health_member::health_member_router::health_member_router,
};

pub struct LifeManagerTenant;

#[async_trait]
impl TenantMount for LifeManagerTenant {
    const MOUNT_PATH: &'static str = "/life-manager";

    type Deps = LifeManagerDeps;
    type State = LifeManagerState;

    fn deps_from_bootstrap(_bootstrap: &AppBootstrap) -> Self::Deps {
        LifeManagerDeps::from_env()
    }

    async fn build_state(
        deps: Self::Deps,
    ) -> Result<Self::State, Box<dyn std::error::Error + Send + Sync>> {
        Ok(LifeManagerStateBuilder::new().build(deps).await?)
    }

    fn router() -> Router<Self::State> {
        api_router()
    }
}

/// Routes for the life-manager tenant API.
pub fn api_router() -> Router<LifeManagerState> {
    Router::new().nest(
        "/api/v1",
        Router::new()
            .nest("/auth", auth_router::<LifeManagerState>())
            .nest("/documents", document_router())
            .nest("/health-members", health_member_router())
            .nest("/health-readings", health_reading_router())
            .nest("/doctor-visits", doctor_visit_router())
            .nest("/cars", car_router())
            .nest("/car-maintenance-events", car_maintenance_event_router()),
    )
}
