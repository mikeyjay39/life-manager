use std::sync::Arc;

use deadpool_diesel::sqlite::Pool;

use crate::{
    application::auth_use_cases::AuthUseCases,
    domain::principal_login_service::PrincipalLoginService,
    infrastructure::{
        argon_password_hasher::ArgonPasswordHasher, auth_user_seeder::ensure_default_admin_user,
        db::run_migrations, principal_orm_collection::PrincipalOrmCollection,
    },
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
        ensure_default_admin_user(&pool, &tenant).await;
        AuthState {
            use_cases: Arc::new(AuthUseCases::new(
                Arc::new(PrincipalLoginService {
                    principal_repository: Arc::new(PrincipalOrmCollection::new(pool.clone())),
                    password_hasher: Arc::new(ArgonPasswordHasher),
                }),
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
