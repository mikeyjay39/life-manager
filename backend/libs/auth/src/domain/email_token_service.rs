use std::sync::Arc;

use chrono::Utc;
use uuid::Uuid;

use crate::domain::{
    email_token::{EmailTokenError, EmailTokenRecord, NewEmailToken},
    email_token_purpose::EmailTokenPurpose,
    email_token_repository::EmailTokenRepository,
    opaque_token_hasher::{OpaqueTokenGenerator, OpaqueTokenHasher},
};

/**
 * Auth email token lifecycle (issue once, consume once).
 *
 * ```text
 *   Caller                 EmailTokenService              EmailTokenRepository
 *     |                            |                                 |
 *     | issue(user, purpose)       |                                 |
 *     |--------------------------->|                                 |
 *     |                            | issue_replacing_unused (txn)    |
 *     |                            |  invalidate + insert            |
 *     |                            |-------------------------------->|
 *     | raw opaque token           |                                 |
 *     |<---------------------------|                                 |
 *     |                            |                                 |
 *     | consume(raw, purpose)      |                                 |
 *     |--------------------------->|                                 |
 *     |                            | find by hash+purpose            |
 *     |                            |-------------------------------->|
 *     |                            | record / none                   |
 *     |                            |<--------------------------------|
 *     |                            | [missing|consumed|expired] -> Err
 *     |                            | mark_consumed                   |
 *     |                            |-------------------------------->|
 *     | EmailTokenRecord           |                                 |
 *     |<---------------------------|                                 |
 * ```
 */
pub struct EmailTokenService {
    pub repository: Arc<dyn EmailTokenRepository>,
    pub hasher: Arc<dyn OpaqueTokenHasher>,
    pub generator: Arc<dyn OpaqueTokenGenerator>,
}

impl EmailTokenService {
    /// Issue a token: invalidate prior unused rows for user+purpose, store hash, return raw once.
    pub async fn issue(
        &self,
        user_id: Uuid,
        tenant: &str,
        purpose: EmailTokenPurpose,
    ) -> Result<String, EmailTokenError> {
        let now = Utc::now().naive_utc();
        let raw = self.generator.generate_raw_token();
        let token_hash = self.hasher.hash_token(&raw);
        let expires_at = now + purpose.default_ttl();

        self.repository
            .issue_replacing_unused(NewEmailToken {
                id: Uuid::new_v4(),
                user_id,
                tenant: tenant.to_string(),
                purpose,
                token_hash,
                expires_at,
                created_at: now,
            })
            .await?;

        Ok(raw)
    }

    /// Find a valid unconsumed token. `expires_at` is an exclusive upper bound.
    pub async fn find_valid(
        &self,
        raw_token: &str,
        purpose: EmailTokenPurpose,
    ) -> Result<EmailTokenRecord, EmailTokenError> {
        let token_hash = self.hasher.hash_token(raw_token);
        let record = self
            .repository
            .find_by_hash_and_purpose(&token_hash, purpose)
            .await?
            .ok_or(EmailTokenError::InvalidOrUsed)?;

        if record.consumed_at.is_some() {
            return Err(EmailTokenError::InvalidOrUsed);
        }

        let now = Utc::now().naive_utc();
        if now >= record.expires_at {
            return Err(EmailTokenError::Expired);
        }

        Ok(record)
    }

    /// Consume a valid token once. A second consume of the same raw token fails.
    pub async fn consume(
        &self,
        raw_token: &str,
        purpose: EmailTokenPurpose,
    ) -> Result<EmailTokenRecord, EmailTokenError> {
        let record = self.find_valid(raw_token, purpose).await?;
        let now = Utc::now().naive_utc();
        self.repository.mark_consumed(record.id, now).await?;
        Ok(EmailTokenRecord {
            consumed_at: Some(now),
            ..record
        })
    }

    /// Mark an already-validated token row as consumed. Fails if already used.
    pub async fn mark_consumed(&self, id: Uuid) -> Result<(), EmailTokenError> {
        let now = Utc::now().naive_utc();
        self.repository.mark_consumed(id, now).await
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use chrono::{Duration, Utc};
    use uuid::Uuid;

    use super::*;
    use crate::domain::opaque_token_hasher::{OpaqueTokenGenerator, OpaqueTokenHasher};

    struct StubHasher;

    impl OpaqueTokenHasher for StubHasher {
        fn hash_token(&self, raw_token: &str) -> String {
            format!("hash:{raw_token}")
        }
    }

    struct FixedGenerator {
        raw: String,
    }

    impl OpaqueTokenGenerator for FixedGenerator {
        fn generate_raw_token(&self) -> String {
            self.raw.clone()
        }
    }

    #[derive(Default)]
    struct StubRepo {
        rows: Mutex<Vec<EmailTokenRecord>>,
        issue_calls: Mutex<Vec<(Uuid, EmailTokenPurpose)>>,
    }

    #[async_trait]
    impl EmailTokenRepository for StubRepo {
        async fn issue_replacing_unused(&self, token: NewEmailToken) -> Result<(), EmailTokenError> {
            self.issue_calls
                .lock()
                .unwrap()
                .push((token.user_id, token.purpose));
            let mut rows = self.rows.lock().unwrap();
            for row in rows.iter_mut() {
                if row.user_id == token.user_id
                    && row.purpose == token.purpose
                    && row.consumed_at.is_none()
                {
                    row.consumed_at = Some(token.created_at);
                }
            }
            rows.push(EmailTokenRecord {
                id: token.id,
                user_id: token.user_id,
                tenant: token.tenant,
                purpose: token.purpose,
                token_hash: token.token_hash,
                expires_at: token.expires_at,
                consumed_at: None,
                created_at: token.created_at,
            });
            Ok(())
        }

        async fn find_by_hash_and_purpose(
            &self,
            token_hash: &str,
            purpose: EmailTokenPurpose,
        ) -> Result<Option<EmailTokenRecord>, EmailTokenError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.token_hash == token_hash && r.purpose == purpose)
                .cloned())
        }

        async fn mark_consumed(
            &self,
            id: Uuid,
            consumed_at: chrono::NaiveDateTime,
        ) -> Result<(), EmailTokenError> {
            let mut rows = self.rows.lock().unwrap();
            let row = rows
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or(EmailTokenError::InvalidOrUsed)?;
            row.consumed_at = Some(consumed_at);
            Ok(())
        }

        async fn delete_all_for_user(&self, user_id: Uuid) -> Result<(), EmailTokenError> {
            self.rows
                .lock()
                .unwrap()
                .retain(|row| row.user_id != user_id);
            Ok(())
        }
    }

    fn given_service(raw: &str) -> (EmailTokenService, Arc<StubRepo>) {
        let repo = Arc::new(StubRepo::default());
        let service = EmailTokenService {
            repository: repo.clone(),
            hasher: Arc::new(StubHasher),
            generator: Arc::new(FixedGenerator {
                raw: raw.to_string(),
            }),
        };
        (service, repo)
    }

    #[tokio::test]
    async fn given_auth_user_when_issuing_signup_verify_then_returns_raw_and_stores_hash() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, repo) = given_service("raw-opaque-token");

        // When
        let raw = service
            .issue(user_id, "life-manager", EmailTokenPurpose::SignupVerify)
            .await
            .expect("issue");

        // Then
        assert_eq!(raw, "raw-opaque-token");
        let rows = repo.rows.lock().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].token_hash, "hash:raw-opaque-token");
        assert_ne!(rows[0].token_hash, raw);
        let delta = rows[0].expires_at - rows[0].created_at;
        assert_eq!(delta, Duration::hours(24));
        assert_eq!(
            repo.issue_calls.lock().unwrap().as_slice(),
            &[(user_id, EmailTokenPurpose::SignupVerify)]
        );
    }

    #[tokio::test]
    async fn given_valid_token_when_consuming_twice_then_second_fails() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, _) = given_service("consume-once-token");
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
    async fn given_expired_token_when_consuming_then_fails_as_expired() {
        // Given
        let (service, repo) = given_service("unused");
        let user_id = Uuid::new_v4();
        let now = Utc::now().naive_utc();
        repo.rows.lock().unwrap().push(EmailTokenRecord {
            id: Uuid::new_v4(),
            user_id,
            tenant: "life-manager".to_string(),
            purpose: EmailTokenPurpose::SignupVerify,
            token_hash: "hash:expired-token".to_string(),
            expires_at: now - Duration::seconds(1),
            consumed_at: None,
            created_at: now - Duration::hours(25),
        });

        // When
        let result = service
            .consume("expired-token", EmailTokenPurpose::SignupVerify)
            .await;

        // Then
        assert_eq!(result, Err(EmailTokenError::Expired));
    }

    #[tokio::test]
    async fn given_password_reset_token_when_consuming_as_signup_verify_then_fails() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, _) = given_service("reset-token");
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

    #[tokio::test]
    async fn given_prior_unused_token_when_issuing_again_then_prior_is_invalidated() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, repo) = given_service("first-token");
        let first = service
            .issue(user_id, "life-manager", EmailTokenPurpose::SignupVerify)
            .await
            .expect("first issue");
        // Switch generator for second issue by rebuilding service with same repo.
        let service = EmailTokenService {
            repository: repo.clone(),
            hasher: Arc::new(StubHasher),
            generator: Arc::new(FixedGenerator {
                raw: "second-token".to_string(),
            }),
        };

        // When
        let second = service
            .issue(user_id, "life-manager", EmailTokenPurpose::SignupVerify)
            .await
            .expect("second issue");

        // Then
        assert_ne!(first, second);
        let first_consume = service
            .consume(&first, EmailTokenPurpose::SignupVerify)
            .await;
        assert_eq!(first_consume, Err(EmailTokenError::InvalidOrUsed));
        assert!(
            service
                .consume(&second, EmailTokenPurpose::SignupVerify)
                .await
                .is_ok()
        );
    }
}
