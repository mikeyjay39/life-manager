use axum::response::IntoResponse;

use crate::infrastructure::auth_user::AuthUser;

pub async fn test_protected_endpoint(AuthUser { username: user }: AuthUser) -> impl IntoResponse {
    format!("Hello {}", user)
}
