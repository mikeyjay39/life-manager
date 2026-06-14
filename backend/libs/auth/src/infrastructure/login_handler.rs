use axum::{Json, extract::State, http::StatusCode};
use jsonwebtoken::{EncodingKey, Header, encode};
use time::{Duration, OffsetDateTime};

use crate::AuthState;
use crate::domain::login_request::{Claims, LoginRequest, LoginResponse};

use crate::domain::jwt_secret::JWT_SECRET;

pub async fn login(
    State(auth_state): State<AuthState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    tracing::info!("Login attempt for user: {}", req.username);

    let login_result = auth_state
        .use_cases
        .login_service
        .login(&req)
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let exp = OffsetDateTime::now_utc() + Duration::hours(1);

    let claims = Claims {
        sub: login_result.user_id,
        exp: exp.unix_timestamp() as usize,
        tenant: login_result.tenant,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&JWT_SECRET),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(LoginResponse { token }))
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
            db::test_pool,
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
            &response.token,
            &DecodingKey::from_secret(&JWT_SECRET),
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
        assert_eq!(result.err(), Some(StatusCode::UNAUTHORIZED));
    }
}
