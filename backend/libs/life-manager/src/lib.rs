pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod life_manager_tenant;
pub mod schema;

pub use infrastructure::shared::app_state::{
    LifeManagerDeps, LifeManagerState, LifeManagerStateBuilder,
};
pub use life_manager_tenant::{LifeManagerTenant, api_router};
