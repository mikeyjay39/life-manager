use axum::{Json, extract::State};
use backend_utils::app_result::ApiResult;
use backend_utils::{AppError, AppResponse};

use crate::AuthState;
use crate::domain::password_reset_request::{
    PasswordResetConfirmRequest, PasswordResetConfirmResponse, PasswordResetRequestRequest,
    PasswordResetRequestResponse,
};

/// Starts a password-reset email flow without revealing whether the email exists.
///
/// ```text
///   Client ----> password_reset_request ----> PasswordResetService.request_reset
///                      |                              |
///                      |                              +--> active user? issue token + EmailSender
///                      |                              +--> unknown/inactive? no mail
///                      v
///               generic success (same shape either way)
/// ```
pub async fn password_reset_request(
    State(auth_state): State<AuthState>,
    Json(req): Json<PasswordResetRequestRequest>,
) -> ApiResult<PasswordResetRequestResponse> {
    tracing::info!("Password-reset request for email: {}", req.email);

    let response = auth_state
        .use_cases
        .password_reset_service
        .request_reset(&req)
        .await
        .map_err(AppError::Validation)?;

    AppResponse::ok(response)
}

/// Confirms a password reset with a one-time token and a new password.
///
/// ```text
///   Client ----> password_reset_confirm ----> PasswordResetService.confirm_reset
///                      |                              |
///                      |                              +--> consume password_reset token
///                      |                              +--> update password hash
///                      v
///               success / invalid-or-expired error
/// ```
pub async fn password_reset_confirm(
    State(auth_state): State<AuthState>,
    Json(req): Json<PasswordResetConfirmRequest>,
) -> ApiResult<PasswordResetConfirmResponse> {
    tracing::info!("Password-reset confirm attempt");

    let response = auth_state
        .use_cases
        .password_reset_service
        .confirm_reset(&req)
        .await
        .map_err(AppError::Validation)?;

    AppResponse::ok(response)
}

#[cfg(test)]
mod tests {
    use std::sync::Once;

    use axum::Json;
    use tracing_test::traced_test;

    use super::*;
    use crate::{
        AuthStateBuilder,
        domain::email_token_purpose::EmailTokenPurpose,
        infrastructure::{
            db::test_pool,
            test_support::{insert_auth_user, issue_password_reset_token},
        },
    };

    fn init_test_env() {
        static INIT: Once = Once::new();
        INIT.call_once(|| unsafe {
            std::env::set_var("JWT_SECRET", "test-secret");
            std::env::set_var("ADMIN_USERNAME", "admin");
            std::env::set_var("ADMIN_PASSWORD", "password");
            std::env::set_var("EMAIL_PROVIDER", "log");
            std::env::set_var(
                "APP_PUBLIC_BASE_URL",
                "https://life-manager.jeszenka.com",
            );
        });
    }

    async fn given_auth_state() -> AuthState {
        AuthStateBuilder::new()
            .build("life-manager".to_string(), test_pool())
            .await
            .expect("build auth state")
    }

    #[tokio::test]
    #[traced_test]
    async fn given_active_user_when_requesting_reset_then_logs_mail_and_returns_generic_success() {
        init_test_env();
        // Given
        let pool = test_pool();
        let email = "reset-active@example.com";
        insert_auth_user(&pool, email, "oldpassword", "life-manager", true)
            .await
            .expect("insert user");
        let auth_state = AuthStateBuilder::new()
            .build("life-manager".to_string(), pool)
            .await
            .expect("build auth state");
        let req = PasswordResetRequestRequest {
            email: email.to_string(),
        };

        // When
        let response = password_reset_request(State(auth_state), Json(req))
            .await
            .expect("request should succeed");

        // Then
        assert!(response.data.message.contains("password reset"));
        assert!(logs_contain("LogOnlyEmailSender: email send"));
        assert!(logs_contain(email));
    }

    #[tokio::test]
    #[traced_test]
    async fn given_unknown_email_when_requesting_reset_then_same_success_without_mail() {
        init_test_env();
        // Given
        let auth_state = given_auth_state().await;
        let req = PasswordResetRequestRequest {
            email: "missing@example.com".to_string(),
        };

        // When
        let response = password_reset_request(State(auth_state), Json(req))
            .await
            .expect("request should succeed");

        // Then
        assert!(response.data.message.contains("password reset"));
        assert!(!logs_contain("LogOnlyEmailSender: email send"));
    }

    #[tokio::test]
    async fn given_valid_token_when_confirming_then_returns_success() {
        init_test_env();
        // Given
        let pool = test_pool();
        let user_id = insert_auth_user(
            &pool,
            "confirm-user@example.com",
            "oldpassword",
            "life-manager",
            true,
        )
        .await
        .expect("insert user");
        let raw = issue_password_reset_token(&pool, user_id, "life-manager")
            .await
            .expect("issue token");
        let auth_state = AuthStateBuilder::new()
            .build("life-manager".to_string(), pool)
            .await
            .expect("build auth state");

        // When
        let response = password_reset_confirm(
            State(auth_state),
            Json(PasswordResetConfirmRequest {
                token: raw,
                new_password: "newpassword1".to_string(),
            }),
        )
        .await
        .expect("confirm should succeed");

        // Then
        assert!(response.data.message.contains("Password updated"));
        let _ = EmailTokenPurpose::PasswordReset;
    }

    #[tokio::test]
    async fn given_bad_token_when_confirming_then_returns_validation_error() {
        init_test_env();
        // Given
        let auth_state = given_auth_state().await;

        // When
        let result = password_reset_confirm(
            State(auth_state),
            Json(PasswordResetConfirmRequest {
                token: "not-a-real-token".to_string(),
                new_password: "newpassword1".to_string(),
            }),
        )
        .await;

        // Then
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
