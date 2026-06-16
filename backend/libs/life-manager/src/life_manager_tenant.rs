use async_trait::async_trait;
use auth::auth_router;
use axum::Router;
use server_host::{AppBootstrap, TenantMount};

use crate::infrastructure::{
    app_state::{LifeManagerDeps, LifeManagerState, LifeManagerStateBuilder},
    document::document_router::document_router,
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

    async fn build_state(deps: Self::Deps) -> Self::State {
        LifeManagerStateBuilder::new().build(deps).await
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
            .nest("/documents", document_router()),
    )
}
