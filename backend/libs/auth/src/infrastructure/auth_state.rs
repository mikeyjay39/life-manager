use std::sync::Arc;

use deadpool_diesel::sqlite::Pool;

use crate::{
    application::auth_use_cases::AuthUseCases,
    domain::email_sender::EmailSender,
    domain::jwt_secret::jwt_secret,
    domain::principal_login_service::PrincipalLoginService,
    domain::principal_signup_service::PrincipalSignupService,
    infrastructure::{
        argon_password_hasher::ArgonPasswordHasher, auth_user_seeder::ensure_default_admin_user,
        db::run_migrations, email_config::EmailConfig, email_sender_factory::build_email_sender,
        principal_orm_collection::PrincipalOrmCollection,
    },
};

#[derive(Clone)]
pub struct AuthState {
    pub(crate) use_cases: Arc<AuthUseCases>,
    pub pool: Arc<Pool>,
    /// Outbound email port (log or Resend). Later stories send verify/reset mail here.
    pub(crate) email_sender: Arc<dyn EmailSender>,
    /// Public app base URL for email links. Later stories use this; unused for now.
    pub(crate) app_public_base_url: Option<String>,
}

pub struct AuthStateBuilder;

impl AuthStateBuilder {
    pub fn new() -> Self {
        Self
    }

    /// Composes auth use cases and the configured email sender.
    ///
    /// ```text
    /// AuthStateBuilder::build
    ///         |
    ///         +--> jwt_secret / migrations / admin seed
    ///         |
    ///         +--> EmailConfig::from_env --> build_email_sender
    ///         |         |                         |
    ///         |         +-- log ----------------> LogOnlyEmailSender
    ///         |         +-- resend -------------> ResendEmailSender
    ///         |
    ///         +--> AuthState { use_cases, email_sender, app_public_base_url }
    /// ```
    pub async fn build(self, tenant: String, pool: Arc<Pool>) -> anyhow::Result<AuthState> {
        jwt_secret()?;
        run_migrations(pool.as_ref()).await?;
        ensure_default_admin_user(&pool, &tenant).await?;
        let email_config = EmailConfig::from_env()?;
        let email_sender = build_email_sender(&email_config)?;
        let app_public_base_url = email_config.app_public_base_url;
        let principal_repository = Arc::new(PrincipalOrmCollection::new(pool.clone()));
        let password_hasher = Arc::new(ArgonPasswordHasher);
        Ok(AuthState {
            use_cases: Arc::new(AuthUseCases::new(
                Arc::new(PrincipalLoginService {
                    principal_repository: principal_repository.clone(),
                    password_hasher: password_hasher.clone(),
                }),
                Arc::new(PrincipalSignupService {
                    principal_repository,
                    password_hasher,
                    tenant: tenant.clone(),
                }),
                tenant,
            )),
            pool,
            email_sender,
            app_public_base_url,
        })
    }
}

impl Default for AuthStateBuilder {
    fn default() -> Self {
        Self::new()
    }
}
