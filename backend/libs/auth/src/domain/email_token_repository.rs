use async_trait::async_trait;
use chrono::NaiveDateTime;
use uuid::Uuid;

use crate::domain::{
    email_token::{EmailTokenError, EmailTokenRecord, NewEmailToken},
    email_token_purpose::EmailTokenPurpose,
};

/// Port for auth email token persistence.
#[async_trait]
pub trait EmailTokenRepository: Sync + Send {
    /// Mark unused tokens for this user+purpose as consumed so they cannot be used.
    async fn invalidate_unused_for(
        &self,
        user_id: Uuid,
        purpose: EmailTokenPurpose,
        consumed_at: NaiveDateTime,
    ) -> Result<(), EmailTokenError>;

    async fn insert(&self, token: NewEmailToken) -> Result<(), EmailTokenError>;

    async fn find_by_hash_and_purpose(
        &self,
        token_hash: &str,
        purpose: EmailTokenPurpose,
    ) -> Result<Option<EmailTokenRecord>, EmailTokenError>;

    async fn mark_consumed(
        &self,
        id: Uuid,
        consumed_at: NaiveDateTime,
    ) -> Result<(), EmailTokenError>;
}
