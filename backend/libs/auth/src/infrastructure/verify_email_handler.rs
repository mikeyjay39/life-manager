use axum::{Json, extract::State};
use backend_utils::app_result::ApiResult;
use backend_utils::{AppError, AppResponse};

use crate::AuthState;
use crate::domain::verify_email_request::{VerifyEmailRequest, VerifyEmailResponse};

/// Activates a user after a valid signup_verify token.
/// +--------+     +--------------------------+     +------------------+     +--------+
/// | Client |---->| PrincipalVerifyEmailSvc  |---->| consume token    |---->| 200    |
/// |        |     | POST /auth/verify-email  |     | set active=true  |     | no JWT |
/// +--------+     +--------------------------+     +------------------+     +--------+
pub async fn verify_email(
    State(auth_state): State<AuthState>,
    Json(req): Json<VerifyEmailRequest>,
) -> ApiResult<VerifyEmailResponse> {
    tracing::info!("Verify-email attempt");

    let response = auth_state
        .use_cases
        .verify_email_service
        .verify_email(&req.token)
        .await
        .map_err(AppError::Validation)?;

    AppResponse::ok(response)
}

#[cfg(test)]
mod tests {
    use std::sync::Once;

    use axum::Json;

    use super::*;
    use crate::{
        AuthStateBuilder,
        domain::verify_email_request::VerifyEmailRequest,
        infrastructure::db::test_pool,
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

    #[tokio::test]
    async fn given_invalid_token_when_verifying_then_returns_validation_error() {
        init_test_env();
        // Given
        let auth_state = AuthStateBuilder::new()
            .build("life-manager".to_string(), test_pool())
            .await
            .expect("build auth state");
        let req = VerifyEmailRequest {
            token: "not-a-real-token".to_string(),
        };

        // When
        let result = verify_email(State(auth_state), Json(req)).await;

        // Then
        assert!(result.is_err());
    }
}
