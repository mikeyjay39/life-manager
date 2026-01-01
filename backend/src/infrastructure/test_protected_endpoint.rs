use crate::infrastructure::auth_user::AuthUser;

async fn test_protected_endpoint(AuthUser { username: user }: AuthUser) -> String {
    format!("Hello {}", user)
}
