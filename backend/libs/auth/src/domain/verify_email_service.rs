use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::{
    email_token::EmailTokenError,
    email_token_purpose::EmailTokenPurpose,
    email_token_service::EmailTokenService,
    principal::{PrincipalRepository, PrincipalWriteError},
    verify_email_request::VerifyEmailResponse,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerifyEmailError {
    Validation(String),
    Internal(String),
}

#[async_trait]
pub trait VerifyEmailService: Sync + Send {
    async fn verify_email(&self, token: &str) -> Result<VerifyEmailResponse, VerifyEmailError>;
}

/**
 * Activates a user for a valid signup_verify token, then consumes the token.
 *
 * ```text
 *   Client          VerifyEmailService         EmailTokenService      PrincipalRepository
 *     |                      |                         |                       |
 *     | POST token           |                         |                       |
 *     |--------------------->|                         |                       |
 *     |                      | find_valid(SignupVerify)|                       |
 *     |                      |------------------------>|                       |
 *     |                      | record / Err            |                       |
 *     |                      |<------------------------|                       |
 *     |                      | set_user_active(true)   |                       |
 *     |                      |----------------------------------------------->|
 *     |                      | ok                      |                       |
 *     |                      |<-----------------------------------------------|
 *     |                      | consume(SignupVerify)   |                       |
 *     |                      |------------------------>|                       |
 *     | 200 message (no JWT) |                         |                       |
 *     |<---------------------|                         |                       |
 * ```
 */
pub struct PrincipalVerifyEmailService {
    pub email_token_service: Arc<EmailTokenService>,
    pub principal_repository: Arc<dyn PrincipalRepository>,
}

#[async_trait]
impl VerifyEmailService for PrincipalVerifyEmailService {
    async fn verify_email(&self, token: &str) -> Result<VerifyEmailResponse, VerifyEmailError> {
        let token = token.trim();
        if token.is_empty() {
            return Err(VerifyEmailError::Validation(
                "Verification token is required.".to_string(),
            ));
        }

        let record = self
            .email_token_service
            .find_valid(token, EmailTokenPurpose::SignupVerify)
            .await
            .map_err(|err| match err {
                EmailTokenError::Expired => VerifyEmailError::Validation(
                    "This verification link has expired.".to_string(),
                ),
                EmailTokenError::InvalidOrUsed => VerifyEmailError::Validation(
                    "This verification link is invalid or already used.".to_string(),
                ),
                EmailTokenError::Database => VerifyEmailError::Internal(
                    "Could not verify email. Please try again later.".to_string(),
                ),
            })?;

        // Activate before consume so a later consume failure does not strand the account.
        self.principal_repository
            .set_user_active_by_id(record.user_id, true)
            .await
            .map_err(|err| match err {
                PrincipalWriteError::NotFound => VerifyEmailError::Validation(
                    "This verification link is invalid or already used.".to_string(),
                ),
                PrincipalWriteError::Database => VerifyEmailError::Internal(
                    "Could not verify email. Please try again later.".to_string(),
                ),
            })?;

        if let Err(err) = self
            .email_token_service
            .consume(token, EmailTokenPurpose::SignupVerify)
            .await
        {
            match err {
                EmailTokenError::InvalidOrUsed => {
                    // Another request may have consumed the token after we activated.
                }
                other => {
                    tracing::error!(
                        "Activated user but failed to consume signup_verify token: {other:?}"
                    );
                }
            }
        }

        Ok(VerifyEmailResponse {
            message: "Email verified. You can sign in now.".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use chrono::{Duration, Utc};
    use uuid::Uuid;

    use super::*;
    use crate::domain::{
        email_token::{EmailTokenRecord, NewEmailToken},
        email_token_repository::EmailTokenRepository,
        opaque_token_hasher::{OpaqueTokenGenerator, OpaqueTokenHasher},
        principal::{
            CreateUserError, Principal, PrincipalRepository, PrincipalWriteError,
            UpdatePasswordError,
        },
    };

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
    struct StubTokenRepo {
        rows: Mutex<Vec<EmailTokenRecord>>,
    }

    #[async_trait]
    impl EmailTokenRepository for StubTokenRepo {
        async fn issue_replacing_unused(
            &self,
            token: NewEmailToken,
        ) -> Result<(), EmailTokenError> {
            self.rows.lock().unwrap().push(EmailTokenRecord {
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

    struct StubPrincipalRepo {
        activated: Mutex<Vec<Uuid>>,
        fail_activate: bool,
    }

    #[async_trait]
    impl PrincipalRepository for StubPrincipalRepo {
        async fn get_principal(&self, _username: &str) -> Option<Box<dyn Principal>> {
            None
        }

        async fn create_user(
            &self,
            _username: &str,
            _password_hash: &str,
            _tenant: &str,
            _active: bool,
        ) -> Result<Uuid, CreateUserError> {
            Ok(Uuid::new_v4())
        }

        async fn update_password(
            &self,
            _user_id: Uuid,
            _password_hash: &str,
        ) -> Result<(), UpdatePasswordError> {
            Ok(())
        }

        async fn is_active(&self, _user_id: Uuid) -> Result<bool, UpdatePasswordError> {
            Ok(true)
        }

        async fn set_user_active_by_id(
            &self,
            user_id: Uuid,
            active: bool,
        ) -> Result<(), PrincipalWriteError> {
            if self.fail_activate {
                return Err(PrincipalWriteError::Database);
            }
            if active {
                self.activated.lock().unwrap().push(user_id);
            }
            Ok(())
        }

        async fn delete_user_by_id(&self, _user_id: Uuid) -> Result<(), PrincipalWriteError> {
            Ok(())
        }
    }

    fn given_service(
        raw: &str,
        fail_activate: bool,
    ) -> (PrincipalVerifyEmailService, Arc<StubPrincipalRepo>, Uuid) {
        let user_id = Uuid::new_v4();
        let token_repo = Arc::new(StubTokenRepo::default());
        let now = Utc::now().naive_utc();
        token_repo.rows.lock().unwrap().push(EmailTokenRecord {
            id: Uuid::new_v4(),
            user_id,
            tenant: "life-manager".to_string(),
            purpose: EmailTokenPurpose::SignupVerify,
            token_hash: format!("hash:{raw}"),
            expires_at: now + Duration::hours(24),
            consumed_at: None,
            created_at: now,
        });
        let principal_repository = Arc::new(StubPrincipalRepo {
            activated: Mutex::new(Vec::new()),
            fail_activate,
        });
        let service = PrincipalVerifyEmailService {
            email_token_service: Arc::new(EmailTokenService {
                repository: token_repo,
                hasher: Arc::new(StubHasher),
                generator: Arc::new(FixedGenerator {
                    raw: raw.to_string(),
                }),
            }),
            principal_repository: principal_repository.clone(),
        };
        (service, principal_repository, user_id)
    }

    #[tokio::test]
    async fn given_valid_token_when_verifying_then_activates_user() {
        // Given
        let (service, principals, user_id) = given_service("good-token", false);

        // When
        let response = service
            .verify_email("good-token")
            .await
            .expect("verify should succeed");

        // Then
        assert!(response.message.contains("sign in"));
        assert_eq!(principals.activated.lock().unwrap().as_slice(), &[user_id]);
    }

    #[tokio::test]
    async fn given_invalid_token_when_verifying_then_returns_error() {
        // Given
        let (service, principals, _) = given_service("good-token", false);

        // When
        let result = service.verify_email("bad-token").await;

        // Then
        assert!(matches!(result, Err(VerifyEmailError::Validation(_))));
        assert!(principals.activated.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn given_activate_db_failure_when_verifying_then_returns_internal_and_keeps_token() {
        // Given
        let (service, _, _) = given_service("good-token", true);

        // When
        let result = service.verify_email("good-token").await;

        // Then
        assert!(matches!(result, Err(VerifyEmailError::Internal(_))));
        let retry = service.verify_email("good-token").await;
        assert!(
            matches!(retry, Err(VerifyEmailError::Internal(_))),
            "token must remain usable after activate failure"
        );
    }
}
