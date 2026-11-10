use chrono::NaiveDateTime;
use uuid::Uuid;

use crate::domain::email_token_purpose::EmailTokenPurpose;

/// Persisted email token row (never includes the raw token).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailTokenRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub tenant: String,
    pub purpose: EmailTokenPurpose,
    pub token_hash: String,
    pub expires_at: NaiveDateTime,
    pub consumed_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
}

/// Row to insert when issuing a token.
#[derive(Debug, Clone)]
pub struct NewEmailToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub tenant: String,
    pub purpose: EmailTokenPurpose,
    pub token_hash: String,
    pub expires_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmailTokenError {
    InvalidOrUsed,
    Expired,
    Database,
}
