use diesel::prelude::*;
use uuid::Uuid;

use crate::domain::{
    email_token::EmailTokenRecord, email_token_purpose::EmailTokenPurpose,
};

#[derive(Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::auth_email_tokens)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct EmailTokenEntity {
    pub id: String,
    pub user_id: String,
    pub tenant: String,
    pub purpose: String,
    pub token_hash: String,
    pub expires_at: chrono::NaiveDateTime,
    pub consumed_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::auth_email_tokens)]
pub struct NewEmailTokenEntity {
    pub id: String,
    pub user_id: String,
    pub tenant: String,
    pub purpose: String,
    pub token_hash: String,
    pub expires_at: chrono::NaiveDateTime,
    pub consumed_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
}

impl EmailTokenEntity {
    pub fn into_record(self) -> Option<EmailTokenRecord> {
        let purpose = EmailTokenPurpose::parse(&self.purpose)?;
        let id = Uuid::parse_str(&self.id).ok()?;
        let user_id = Uuid::parse_str(&self.user_id).ok()?;
        Some(EmailTokenRecord {
            id,
            user_id,
            tenant: self.tenant,
            purpose,
            token_hash: self.token_hash,
            expires_at: self.expires_at,
            consumed_at: self.consumed_at,
            created_at: self.created_at,
        })
    }
}
