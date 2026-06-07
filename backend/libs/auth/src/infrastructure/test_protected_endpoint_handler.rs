use axum::response::IntoResponse;

use crate::AuthUser;

pub async fn test_protected_endpoint(AuthUser { user_id: user }: AuthUser) -> impl IntoResponse {
    format!("Hello {}", user.to_string())
}
