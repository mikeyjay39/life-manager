use async_trait::async_trait;
use axum::Router;

/// Build-time composition context shared across tenant crates.
/// Not registered as Axum state — used only when mounting tenant routers.
#[derive(Clone, Debug, Default)]
pub struct AppBootstrap {}

impl AppBootstrap {
    pub fn from_env() -> Self {
        Self::default()
    }
}

#[async_trait]
pub trait TenantMount {
    const MOUNT_PATH: &'static str;

    type Deps: Send;
    type State: Clone + Send + Sync + 'static;

    fn deps_from_bootstrap(bootstrap: &AppBootstrap) -> Self::Deps;
    async fn build_state(deps: Self::Deps) -> Self::State;
    fn router() -> Router<Self::State>;

    async fn mount(bootstrap: &AppBootstrap) -> Router {
        let deps = Self::deps_from_bootstrap(bootstrap);
        let state = Self::build_state(deps).await;
        Self::router().with_state(state)
    }

    fn mount_with_state(state: Self::State) -> Router {
        Self::router().with_state(state)
    }
}
