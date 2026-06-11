use axum::response::IntoResponse;

use crate::{AuthUser, domain::principal::Principal};

pub async fn test_protected_endpoint(user: AuthUser) -> impl IntoResponse {
    format!("Hello {}", user.user_id().to_string())
}
