use axum::{Json, http::StatusCode};
use jsonwebtoken::{EncodingKey, Header, encode};
use time::{Duration, OffsetDateTime};

use crate::infrastructure::auth::login_request::{Claims, LoginRequest, LoginResponse};

pub static JWT_SECRET: &[u8] = b"dev-secret"; // move to env in real apps

pub async fn login(Json(req): Json<LoginRequest>) -> Result<Json<LoginResponse>, StatusCode> {
    // TODO: Replace with real authentication
    if req.username != "admin" || req.password != "password" {
        return Err(StatusCode::UNAUTHORIZED);
    }

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
