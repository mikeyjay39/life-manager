use crate::infrastructure::auth_user::AuthUser;

async fn test_protected_endpoint(AuthUser(user): AuthUser) -> String {
    format!("Hello {}", user.username)
}
