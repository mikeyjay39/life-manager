use async_trait::async_trait;
use uuid::Uuid;

/**
 * Represents the authenticated user in the system.
 */
pub trait Principal: Sync + Send {
    fn user_id(&self) -> &Uuid;
    fn tenant(&self) -> &str;
}

/**
 * Port for principal repository operations.
 */
#[async_trait]
pub trait PrincipalRepository: Sync + Send {
    async fn get_principal(&self, user_id: &Uuid) -> Option<Box<dyn Principal>>;
}
