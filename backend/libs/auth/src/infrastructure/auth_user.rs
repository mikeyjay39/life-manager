use axum::{
    extract::{FromRef, FromRequestParts},
    http::{StatusCode, request::Parts},
};
use jsonwebtoken::{DecodingKey, Validation, decode};
use uuid::Uuid;

use crate::domain::login_request::Claims;
use crate::{AuthState, domain::jwt_secret::JWT_SECRET};

pub struct AuthUser {
    pub user_id: Uuid,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    AuthState: FromRef<S>,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_state = AuthState::from_ref(state);
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let claims = decode::<Claims>(
            token,
            &DecodingKey::from_secret(&JWT_SECRET),
            &Validation::default(),
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?
        .claims;

        match claims.tenant == auth_state.0.tenant {
            true => {
                return Ok(AuthUser {
                    user_id: claims.sub,
                });
            }
            false => {
                tracing::warn!(
                    "Tenant claim {} did not match for tenant {} for user_id {}",
                    claims.tenant,
                    auth_state.0.tenant,
                    claims.sub
                );
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Once};

    use axum::http::{Request, header};
    use jsonwebtoken::{EncodingKey, Header, encode};
    use time::{Duration, OffsetDateTime};

    use super::*;
    use crate::{
        application::auth_use_cases::AuthUseCases,
        infrastructure::superuser_only_login_service::SuperuserOnlyLoginService,
    };

    #[derive(Clone)]
    struct TestState(AuthState);

    impl FromRef<TestState> for AuthState {
        fn from_ref(state: &TestState) -> Self {
            state.0.clone()
        }
    }

    fn init_test_env() {
        static INIT: Once = Once::new();
        INIT.call_once(|| {
            unsafe {
                std::env::set_var("JWT_SECRET", "test-secret");
            }
        });
    }

    fn given_auth_state(tenant: &str) -> TestState {
        let tenant = tenant.to_string();
        TestState(AuthState(Arc::new(AuthUseCases::new(
            Arc::new(SuperuserOnlyLoginService::new(
                "admin".into(),
                "password".into(),
                tenant.clone(),
            )),
            tenant,
        ))))
    }

    fn given_bearer_token(user_id: Uuid, tenant: &str) -> String {
        let exp = OffsetDateTime::now_utc() + Duration::hours(1);
        let claims = Claims {
            sub: user_id,
            exp: exp.unix_timestamp() as usize,
            tenant: tenant.to_string(),
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(&JWT_SECRET),
        )
        .expect("Failed to encode test token");
        format!("Bearer {token}")
    }

    fn given_request_parts(bearer: &str) -> Parts {
        Request::builder()
            .header(header::AUTHORIZATION, bearer)
            .body(())
            .expect("Failed to build request")
            .into_parts()
            .0
    }

    #[tokio::test]
    async fn given_matching_tenant_claim_when_extracting_auth_user_then_succeeds() {
        init_test_env();
        // Given
        let user_id = Uuid::new_v4();
        let state = given_auth_state("life-manager");
        let bearer = given_bearer_token(user_id, "life-manager");
        let mut parts = given_request_parts(&bearer);

        // When
        let result = AuthUser::from_request_parts(&mut parts, &state).await;

        // Then
        assert_eq!(result.unwrap().user_id, user_id);
    }

    #[tokio::test]
    async fn given_mismatched_tenant_claim_when_extracting_auth_user_then_returns_unauthorized()
    {
        init_test_env();
        // Given
        let user_id = Uuid::new_v4();
        let state = given_auth_state("life-manager");
        let bearer = given_bearer_token(user_id, "other-tenant");
        let mut parts = given_request_parts(&bearer);

        // When
        let result = AuthUser::from_request_parts(&mut parts, &state).await;

        // Then
        assert_eq!(result.err(), Some(StatusCode::UNAUTHORIZED));
    }
}
