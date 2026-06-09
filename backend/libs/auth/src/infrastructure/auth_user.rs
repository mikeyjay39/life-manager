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
