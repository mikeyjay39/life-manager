use std::sync::Arc;

use crate::{
    application::auth_use_cases::AuthUseCases,
    infrastructure::superuser_only_login_service::SuperuserOnlyLoginService,
};

#[derive(Clone)]
pub struct AuthState(pub(crate) Arc<AuthUseCases>);

pub struct AuthStateBuilder;

impl AuthStateBuilder {
    pub fn new() -> Self {
        Self
    }

    pub fn build(self, tenant: String) -> AuthState {
        AuthState(Arc::new(AuthUseCases::new(
            Arc::new(SuperuserOnlyLoginService::from_env_with_tenant(tenant.clone())),
            tenant,
        )))
    }
}

impl Default for AuthStateBuilder {
    fn default() -> Self {
        Self::new()
    }
}
