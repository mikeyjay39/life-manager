use axum::{Json, extract::State};
use backend_utils::app_result::ApiResult;
use backend_utils::{AppError, AppResponse};

use crate::AuthState;
use crate::domain::signup_request::{SignupRequest, SignupResponse};
use crate::domain::signup_service::SignupError;

/// Registers a new inactive user and sends a signup verify email.
/// +--------+     +-----------------------+     +---------------------+     +---------------+
/// | Client |---->| PrincipalSignupService |---->| INSERT active=false |---->| issue token   |
/// |        |     | (validate email/pw)    |     | tenant = mount      |     | EmailSender   |
/// +--------+     +-----------------------+     +---------------------+     +-------+-------+
///                                                                               |
///                                              +-- send ok -------------------->+--> 201
///                                              +-- send fail --> rollback user --> 503
pub async fn signup(
    State(auth_state): State<AuthState>,
    Json(req): Json<SignupRequest>,
) -> ApiResult<SignupResponse> {
    tracing::info!("Signup attempt for email: {}", req.email);

    let response = auth_state
        .use_cases
        .signup_service
        .signup(&req)
        .await
        .map_err(|err| match err {
            SignupError::Validation(msg) => AppError::Validation(msg),
            SignupError::EmailSendFailed(msg) => AppError::ServiceUnavailable(msg),
        })?;

    AppResponse::created(response)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Once};

    use axum::Json;

    use super::*;
    use crate::{
        AuthStateBuilder,
        domain::{
            email_token_service::EmailTokenService,
            password_reset_request::{
                PasswordResetConfirmRequest, PasswordResetConfirmResponse,
                PasswordResetRequestRequest, PasswordResetRequestResponse,
            },
            password_reset_service::PasswordResetService,
            principal::{
                CreateUserError, Principal, PrincipalRepository, PrincipalWriteError,
                UpdatePasswordError,
            },
            principal_login_service::PrincipalLoginService,
            principal_signup_service::PrincipalSignupService,
            signup_request::SignupRequest,
            verify_email_service::PrincipalVerifyEmailService,
        },
        infrastructure::{
            argon_password_hasher::ArgonPasswordHasher,
            db::test_pool,
            email_token_orm_collection::EmailTokenOrmCollection,
            log_only_email_sender::LogOnlyEmailSender,
            principal_orm_collection::PrincipalOrmCollection,
            sha256_token_hasher::{OsRngOpaqueTokenGenerator, Sha256TokenHasher},
        },
    };

    fn init_test_env() {
        static INIT: Once = Once::new();
        INIT.call_once(|| unsafe {
            std::env::set_var("JWT_SECRET", "test-secret");
            std::env::set_var("ADMIN_USERNAME", "admin");
            std::env::set_var("ADMIN_PASSWORD", "password");
            std::env::set_var("APP_PUBLIC_BASE_URL", "http://localhost:8081");
        });
    }

    async fn given_auth_state(tenant: &str) -> AuthState {
        AuthStateBuilder::new()
            .build(tenant.to_string(), test_pool())
            .await
            .expect("build auth state")
    }

    #[tokio::test]
    async fn given_valid_signup_when_creating_user_then_returns_created() {
        init_test_env();
        // Given
        let auth_state = given_auth_state("life-manager").await;
        let req = SignupRequest {
            email: "new-user@example.com".to_string(),
            password: "password123".to_string(),
        };

        // When
        let response = signup(State(auth_state), Json(req))
            .await
            .expect("Signup should succeed");

        // Then
        assert!(response.data.message.contains("Check your email"));
    }

    #[derive(Clone)]
    struct DuplicateRepository;

    #[async_trait::async_trait]
    impl PrincipalRepository for DuplicateRepository {
        async fn get_principal(&self, _username: &str) -> Option<Box<dyn Principal>> {
            None
        }

        async fn create_user(
            &self,
            _username: &str,
            _password_hash: &str,
            _tenant: &str,
            _active: bool,
        ) -> Result<uuid::Uuid, CreateUserError> {
            Err(CreateUserError::DuplicateUsername)
        }

        async fn update_password(
            &self,
            _user_id: uuid::Uuid,
            _password_hash: &str,
        ) -> Result<(), UpdatePasswordError> {
            Ok(())
        }

        async fn is_active(&self, _user_id: uuid::Uuid) -> Result<bool, UpdatePasswordError> {
            Ok(true)
        }

        async fn set_user_active_by_id(
            &self,
            _user_id: uuid::Uuid,
            _active: bool,
        ) -> Result<(), PrincipalWriteError> {
            Ok(())
        }

        async fn delete_user_by_id(
            &self,
            _user_id: uuid::Uuid,
        ) -> Result<(), PrincipalWriteError> {
            Ok(())
        }
    }

    struct UnusedPasswordResetService;

    #[async_trait::async_trait]
    impl PasswordResetService for UnusedPasswordResetService {
        async fn request_reset(
            &self,
            _req: &PasswordResetRequestRequest,
        ) -> Result<PasswordResetRequestResponse, String> {
            unreachable!("signup tests do not call password reset")
        }

        async fn confirm_reset(
            &self,
            _req: &PasswordResetConfirmRequest,
        ) -> Result<PasswordResetConfirmResponse, String> {
            unreachable!("signup tests do not call password reset")
        }
    }

    #[tokio::test]
    async fn given_duplicate_email_when_signing_up_then_returns_validation_error() {
        init_test_env();
        // Given
        let pool = test_pool();
        let email_token_service = Arc::new(EmailTokenService {
            repository: Arc::new(EmailTokenOrmCollection::new(pool.clone())),
            hasher: Arc::new(Sha256TokenHasher),
            generator: Arc::new(OsRngOpaqueTokenGenerator),
        });
        let email_sender: Arc<dyn crate::domain::email_sender::EmailSender> =
            Arc::new(LogOnlyEmailSender);
        let auth_state = AuthState {
            use_cases: Arc::new(crate::application::auth_use_cases::AuthUseCases::new(
                Arc::new(PrincipalLoginService {
                    principal_repository: Arc::new(PrincipalOrmCollection::new(pool.clone())),
                    password_hasher: Arc::new(ArgonPasswordHasher),
                }),
                Arc::new(PrincipalSignupService {
                    principal_repository: Arc::new(DuplicateRepository),
                    password_hasher: Arc::new(ArgonPasswordHasher),
                    email_token_service: email_token_service.clone(),
                    email_sender: email_sender.clone(),
                    app_public_base_url: Some("http://localhost:8081".to_string()),
                    tenant: "life-manager".to_string(),
                }),
                Arc::new(PrincipalVerifyEmailService {
                    email_token_service,
                    principal_repository: Arc::new(PrincipalOrmCollection::new(pool.clone())),
                }),
                Arc::new(UnusedPasswordResetService),
                "life-manager".to_string(),
            )),
            pool,
            email_sender,
            app_public_base_url: Some("http://localhost:8081".to_string()),
        };
        let req = SignupRequest {
            email: "existing@example.com".to_string(),
            password: "password123".to_string(),
        };

        // When
        let result = signup(State(auth_state), Json(req)).await;

        // Then
        assert!(result.is_err());
    }
}
