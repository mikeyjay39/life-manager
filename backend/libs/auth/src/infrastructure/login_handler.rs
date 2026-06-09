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
        .0
        .login_service
        .login(&req)
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
