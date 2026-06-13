use std::sync::Arc;

use deadpool_diesel::sqlite::Pool;

use crate::{
    application::auth_use_cases::AuthUseCases,
    infrastructure::{db::run_migrations, superuser_only_login_service::SuperuserOnlyLoginService},
};

#[derive(Clone)]
pub struct AuthState {
    pub(crate) use_cases: Arc<AuthUseCases>,
    pub pool: Arc<Pool>,
}

pub struct AuthStateBuilder;

impl AuthStateBuilder {
    pub fn new() -> Self {
        Self
    }

    pub async fn build(self, tenant: String, pool: Arc<Pool>) -> AuthState {
        run_migrations(pool.as_ref()).await;
        AuthState {
            use_cases: Arc::new(AuthUseCases::new(
                Arc::new(SuperuserOnlyLoginService::from_env_with_tenant(
                    tenant.clone(),
                )),
                tenant,
            )),
            pool,
        }
    }
}

impl Default for AuthStateBuilder {
    fn default() -> Self {
        Self::new()
    }
}
