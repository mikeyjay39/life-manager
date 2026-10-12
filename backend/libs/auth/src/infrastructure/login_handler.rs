use axum::{Json, extract::State};
use backend_utils::app_result::ApiResult;
use backend_utils::{AppError, AppResponse};
use jsonwebtoken::{EncodingKey, Header, encode};
use time::{Duration, OffsetDateTime};

use crate::AuthState;
use crate::domain::login_request::{Claims, LoginRequest, LoginResponse};

use crate::domain::jwt_secret::jwt_secret;

/// Authenticates credentials and issues a JWT for the tenant mount.
/// +--------+     +----------------------+     +---------------------+     +--------+
/// | Client |---->| PrincipalLoginService |---->| tenant == mount?    |---->| JWT    |
/// |        |     | (active user only)    |     | (reject if mismatch)|     |        |
/// +--------+     +----------------------+     +---------------------+     +--------+
pub async fn login(
    State(auth_state): State<AuthState>,
    Json(req): Json<LoginRequest>,
) -> ApiResult<LoginResponse> {
    tracing::info!("Login attempt for user: {}", req.username);

    let login_result = auth_state
        .use_cases
        .login_service
        .login(&req)
        .await
        .map_err(|_| AppError::Unauthorized)?;

    if login_result.tenant != auth_state.use_cases.tenant {
        tracing::warn!(
            "Login rejected: principal tenant {} does not match mount tenant {}",
            login_result.tenant,
            auth_state.use_cases.tenant
        );
        return AppResponse::unauthorized();
    }

    let exp = OffsetDateTime::now_utc() + Duration::hours(1);

    let claims = Claims {
        sub: login_result.user_id,
        exp: exp.unix_timestamp() as usize,
        tenant: login_result.tenant,
    };

    let secret = jwt_secret().map_err(|err| {
        tracing::error!("JWT secret is not available: {err}");
        AppError::internal_err_from_msg("JWT secret is not available")
    })?;
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret),
    )
    .map_err(|e| AppError::Internal(e.into()))?;

    AppResponse::ok(LoginResponse { token })
}

#[cfg(test)]
mod tests {
    use std::sync::Once;

    use axum::Json;
    use jsonwebtoken::{DecodingKey, Validation, decode};

    use super::*;
    use crate::{
        AuthStateBuilder,
        infrastructure::{
            auth_user_seeder::admin_user_uuid,
            db::{fresh_test_pool, run_migrations, test_pool},
            test_support::insert_auth_user,
        },
    };

    fn init_test_env() {
        static INIT: Once = Once::new();
        INIT.call_once(|| unsafe {
            std::env::set_var("JWT_SECRET", "test-secret");
            std::env::set_var("ADMIN_USERNAME", "admin");
            std::env::set_var("ADMIN_PASSWORD", "password");
        });
    }

    async fn given_auth_state(tenant: &str) -> AuthState {
        AuthStateBuilder::new()
            .build(tenant.to_string(), test_pool())
            .await
            .expect("build auth state")
    }

    #[tokio::test]
    async fn given_valid_login_when_issuing_token_then_tenant_matches_auth_state() {
        init_test_env();
        // Given
        let auth_state = given_auth_state("life-manager").await;
        let req = LoginRequest {
            username: "admin".into(),
            password: "password".into(),
        };

        // When
        let response = login(State(auth_state.clone()), Json(req))
            .await
            .expect("Login should succeed");

        let claims = decode::<Claims>(
            &response.data.token,
            &DecodingKey::from_secret(jwt_secret().expect("JWT secret")),
            &Validation::default(),
        )
        .expect("Token should decode")
        .claims;

        // Then
        assert_eq!(claims.tenant, auth_state.use_cases.tenant);
        assert_eq!(claims.sub, admin_user_uuid());
    }

    #[tokio::test]
    async fn given_invalid_password_when_issuing_token_then_returns_unauthorized() {
        init_test_env();
        // Given
        let auth_state = given_auth_state("life-manager").await;
        let req = LoginRequest {
            username: "admin".into(),
            password: "wrong-password".into(),
        };

        // When
        let result = login(State(auth_state), Json(req)).await;

        // Then
        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[tokio::test]
    async fn given_principal_with_wrong_tenant_when_logging_in_then_returns_unauthorized() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref())
            .await
            .expect("run migrations");
        insert_auth_user(&pool, "other-user", "password", "other-tenant", true)
            .await
            .expect("insert user");
        let auth_state = AuthStateBuilder::new()
            .build("life-manager".to_string(), pool)
            .await
            .expect("build auth state");
        let req = LoginRequest {
            username: "other-user".into(),
            password: "password".into(),
        };

        // When
        let result = login(State(auth_state), Json(req)).await;

        // Then
        assert!(matches!(result, Err(AppError::Unauthorized)));
    }
}
