use async_trait::async_trait;

#[async_trait]
pub trait AuthPasswordHasher
where
    Self: Sync + Send,
{
    fn hash_password(&self, password: &str) -> String;
    fn verify_password(&self, password: &str, hashed_password: &str) -> bool;
}
