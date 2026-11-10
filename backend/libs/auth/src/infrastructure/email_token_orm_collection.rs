use std::sync::Arc;

use async_trait::async_trait;
use chrono::NaiveDateTime;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl, SelectableHelper};
use uuid::Uuid;

use crate::{
    domain::{
        email_token::{EmailTokenError, EmailTokenRecord, NewEmailToken},
        email_token_purpose::EmailTokenPurpose,
        email_token_repository::EmailTokenRepository,
    },
    infrastructure::email_token_entity::{EmailTokenEntity, NewEmailTokenEntity},
    schema::auth_email_tokens,
};

#[derive(Clone)]
pub struct EmailTokenOrmCollection {
    pub pool: Arc<Pool>,
}

impl EmailTokenOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl EmailTokenRepository for EmailTokenOrmCollection {
    async fn issue_replacing_unused(&self, token: NewEmailToken) -> Result<(), EmailTokenError> {
        let consumed_at = token.created_at;
        let user_id = token.user_id.to_string();
        let purpose = token.purpose.as_str().to_string();
        let entity = NewEmailTokenEntity {
            id: token.id.to_string(),
            user_id: token.user_id.to_string(),
            tenant: token.tenant,
            purpose: token.purpose.as_str().to_string(),
            token_hash: token.token_hash,
            expires_at: token.expires_at,
            consumed_at: None,
            created_at: token.created_at,
        };

        let conn = self.pool.get().await.map_err(|e| {
            tracing::error!("Failed to get database connection from pool: {}", e);
            EmailTokenError::Database
        })?;

        conn.interact(move |conn| {
            conn.immediate_transaction(|conn| {
                diesel::update(
                    auth_email_tokens::table
                        .filter(auth_email_tokens::user_id.eq(user_id))
                        .filter(auth_email_tokens::purpose.eq(purpose))
                        .filter(auth_email_tokens::consumed_at.is_null()),
                )
                .set(auth_email_tokens::consumed_at.eq(Some(consumed_at)))
                .execute(conn)?;

                diesel::insert_into(auth_email_tokens::table)
                    .values(&entity)
                    .execute(conn)?;
                Ok::<(), diesel::result::Error>(())
            })
        })
        .await
        .map_err(|e| {
            tracing::error!("Database interact error: {}", e);
            EmailTokenError::Database
        })?
        .map_err(|e| {
            tracing::error!("Failed to issue email token: {}", e);
            EmailTokenError::Database
        })?;

        Ok(())
    }

    async fn find_by_hash_and_purpose(
        &self,
        token_hash: &str,
        purpose: EmailTokenPurpose,
    ) -> Result<Option<EmailTokenRecord>, EmailTokenError> {
        let token_hash = token_hash.to_string();
        let purpose = purpose.as_str().to_string();
        let conn = self.pool.get().await.map_err(|e| {
            tracing::error!("Failed to get database connection from pool: {}", e);
            EmailTokenError::Database
        })?;

        let entity = conn
            .interact(move |conn| {
                auth_email_tokens::table
                    .filter(auth_email_tokens::token_hash.eq(token_hash))
                    .filter(auth_email_tokens::purpose.eq(purpose))
                    .select(EmailTokenEntity::as_select())
                    .first::<EmailTokenEntity>(conn)
                    .optional()
            })
            .await
            .map_err(|e| {
                tracing::error!("Database interact error: {}", e);
                EmailTokenError::Database
            })?
            .map_err(|e| {
                tracing::error!("Failed to find email token: {}", e);
                EmailTokenError::Database
            })?;

        match entity {
            Some(row) => row.into_record().map(Some).ok_or_else(|| {
                tracing::error!("Stored email token row could not be mapped to domain");
                EmailTokenError::Database
            }),
            None => Ok(None),
        }
    }

    async fn mark_consumed(
        &self,
        id: Uuid,
        consumed_at: NaiveDateTime,
    ) -> Result<(), EmailTokenError> {
        let id = id.to_string();
        let conn = self.pool.get().await.map_err(|e| {
            tracing::error!("Failed to get database connection from pool: {}", e);
            EmailTokenError::Database
        })?;

        let updated = conn
            .interact(move |conn| {
                diesel::update(
                    auth_email_tokens::table
                        .filter(auth_email_tokens::id.eq(id))
                        .filter(auth_email_tokens::consumed_at.is_null()),
                )
                .set(auth_email_tokens::consumed_at.eq(Some(consumed_at)))
                .execute(conn)
            })
            .await
            .map_err(|e| {
                tracing::error!("Database interact error: {}", e);
                EmailTokenError::Database
            })?
            .map_err(|e| {
                tracing::error!("Failed to mark email token consumed: {}", e);
                EmailTokenError::Database
            })?;

        if updated == 0 {
            return Err(EmailTokenError::InvalidOrUsed);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::Duration;

    use super::*;
    use crate::{
        domain::{
            email_token_service::EmailTokenService,
            opaque_token_hasher::OpaqueTokenHasher,
        },
        infrastructure::{
            db::{fresh_test_pool, run_migrations},
            sha256_token_hasher::{OsRngOpaqueTokenGenerator, Sha256TokenHasher},
            test_support::insert_auth_user,
        },
    };

    async fn given_service() -> (EmailTokenService, Uuid, Arc<EmailTokenOrmCollection>) {
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref())
            .await
            .expect("run migrations");
        let user_id = insert_auth_user(&pool, "token-user@example.com", "password", "life-manager", true)
            .await
            .expect("insert user");
        let repo = Arc::new(EmailTokenOrmCollection::new(pool));
        let service = EmailTokenService {
            repository: repo.clone(),
            hasher: Arc::new(Sha256TokenHasher),
            generator: Arc::new(OsRngOpaqueTokenGenerator),
        };
        (service, user_id, repo)
    }

    #[tokio::test]
    async fn given_user_when_issuing_then_stores_hash_not_raw_with_24h_expiry() {
        // Given
        let (service, user_id, repo) = given_service().await;
        let hasher = Sha256TokenHasher;

        // When
        let raw = service
            .issue(user_id, "life-manager", EmailTokenPurpose::SignupVerify)
            .await
            .expect("issue");

        // Then
        let expected_hash = hasher.hash_token(&raw);
        let stored = repo
            .find_by_hash_and_purpose(&expected_hash, EmailTokenPurpose::SignupVerify)
            .await
            .expect("find")
            .expect("row");
        assert_ne!(stored.token_hash, raw);
        assert_eq!(stored.token_hash, expected_hash);
        let delta = stored.expires_at - stored.created_at;
        assert!(
            (delta - Duration::hours(24)).num_seconds().abs() < 2,
            "expected ~24h TTL, got {delta}"
        );
    }

    #[tokio::test]
    async fn given_valid_token_when_consuming_twice_then_second_fails() {
        // Given
        let (service, user_id, _) = given_service().await;
        let raw = service
            .issue(user_id, "life-manager", EmailTokenPurpose::SignupVerify)
            .await
            .expect("issue");

        // When
        let first = service
            .consume(&raw, EmailTokenPurpose::SignupVerify)
            .await;
        let second = service
            .consume(&raw, EmailTokenPurpose::SignupVerify)
            .await;

        // Then
        assert!(first.is_ok());
        assert_eq!(second, Err(EmailTokenError::InvalidOrUsed));
    }

    #[tokio::test]
    async fn given_wrong_purpose_when_consuming_then_fails() {
        // Given
        let (service, user_id, _) = given_service().await;
        let raw = service
            .issue(user_id, "life-manager", EmailTokenPurpose::PasswordReset)
            .await
            .expect("issue");

        // When
        let result = service
            .consume(&raw, EmailTokenPurpose::SignupVerify)
            .await;

        // Then
        assert_eq!(result, Err(EmailTokenError::InvalidOrUsed));
    }
}
