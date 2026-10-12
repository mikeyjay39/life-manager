use std::fmt;

use async_trait::async_trait;

#[derive(Debug)]
pub struct PasswordHashError;

impl fmt::Display for PasswordHashError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Failed to hash password")
    }
}

impl std::error::Error for PasswordHashError {}

#[async_trait]
pub trait AuthPasswordHasher
where
    Self: Sync + Send,
{
    fn hash_password(&self, password: &str) -> Result<String, PasswordHashError>;
    fn verify_password(&self, password: &str, hashed_password: &str) -> bool;
}
