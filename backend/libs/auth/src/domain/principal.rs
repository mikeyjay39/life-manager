use async_trait::async_trait;
use uuid::Uuid;

/**
 * Represents the authenticated user in the system.
 */
pub trait Principal: Sync + Send {
    fn user_id(&self) -> Uuid;
    fn tenant(&self) -> &str;
    fn password_hash(&self) -> &str;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CreateUserError {
    DuplicateUsername,
    Database,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdatePasswordError {
    NotFound,
    Database,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrincipalWriteError {
    NotFound,
    Database,
}

/**
 * Port for principal repository operations.
 */
#[async_trait]
pub trait PrincipalRepository: Sync + Send {
    async fn get_principal(&self, username: &str) -> Option<Box<dyn Principal>>;

    /// Inserts a user and returns the new user id.
    async fn create_user(
        &self,
        username: &str,
        password_hash: &str,
        tenant: &str,
        active: bool,
    ) -> Result<Uuid, CreateUserError>;

    /// Replace the password hash for a user id. Does not change `active`.
    async fn update_password(
        &self,
        user_id: Uuid,
        password_hash: &str,
    ) -> Result<(), UpdatePasswordError>;

    /// True when a user row exists and `active` is true.
    async fn is_active(&self, user_id: Uuid) -> Result<bool, UpdatePasswordError>;

    /// Sets `active` for a user by id.
    async fn set_user_active_by_id(
        &self,
        user_id: Uuid,
        active: bool,
    ) -> Result<(), PrincipalWriteError>;

    /// Deletes a user by id. Callers must remove dependent rows first.
    async fn delete_user_by_id(&self, user_id: Uuid) -> Result<(), PrincipalWriteError>;
}
