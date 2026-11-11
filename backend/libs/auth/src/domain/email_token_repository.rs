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
    /// Invalidate unused tokens for user+purpose, then insert the new row, in one transaction.
    async fn issue_replacing_unused(&self, token: NewEmailToken) -> Result<(), EmailTokenError>;

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

    /// Deletes all email tokens for a user (rollback after failed verify mail).
    async fn delete_all_for_user(&self, user_id: Uuid) -> Result<(), EmailTokenError>;
}
