use axum::{Json, extract::State, http::StatusCode};
use jsonwebtoken::{EncodingKey, Header, encode};
use time::{Duration, OffsetDateTime};

use crate::infrastructure::auth::{
    auth_state::AuthState,
    login_request::{Claims, LoginRequest, LoginResponse},
};

pub static JWT_SECRET: &[u8] = b"dev-secret"; // move to env in real apps

pub async fn login(
    State(AuthState(auth_use_cases)): State<AuthState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    tracing::info!("Login attempt for user: {}", req.username);

    auth_use_cases
        .login_service
        .login(&req)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let exp = OffsetDateTime::now_utc() + Duration::hours(1);

    let claims = Claims {
        sub: req.username,
        exp: exp.unix_timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(JWT_SECRET),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(LoginResponse { token }))
}
