use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::{
    auth_password_hasher::AuthPasswordHasher,
    email_message::EmailMessage,
    email_sender::EmailSender,
    email_token::EmailTokenError,
    email_token_purpose::EmailTokenPurpose,
    email_token_service::EmailTokenService,
    password_reset_request::{
        PasswordResetConfirmRequest, PasswordResetConfirmResponse, PasswordResetRequestRequest,
        PasswordResetRequestResponse,
    },
    password_reset_service::PasswordResetService,
    principal::{PrincipalRepository, UpdatePasswordError},
};

const MIN_PASSWORD_LEN: usize = 8;
const GENERIC_REQUEST_MESSAGE: &str =
    "If an account exists for that email, we sent a password reset link.";
const CONFIRM_SUCCESS_MESSAGE: &str = "Password updated. You can sign in with your new password.";
const INVALID_TOKEN_MESSAGE: &str = "This reset link is invalid or has expired.";

pub struct PrincipalPasswordResetService {
    pub principal_repository: Arc<dyn PrincipalRepository>,
    pub password_hasher: Arc<dyn AuthPasswordHasher>,
    pub email_token_service: Arc<EmailTokenService>,
    pub email_sender: Arc<dyn EmailSender>,
    pub app_public_base_url: Option<String>,
    pub tenant: String,
}

fn validate_email(email: &str) -> Result<String, String> {
    let email = email.trim();
    if email.is_empty() {
        return Err("Email is required.".to_string());
    }

    let Some((local, domain)) = email.split_once('@') else {
        return Err("Enter a valid email address.".to_string());
    };

    if local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err("Enter a valid email address.".to_string());
    }

    Ok(email.to_string())
}

fn validate_password(password: &str) -> Result<(), String> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(format!(
            "Password must be at least {MIN_PASSWORD_LEN} characters."
        ));
    }
    Ok(())
}

fn reset_link(base_url: &str, raw_token: &str) -> String {
    let base = base_url.trim_end_matches('/');
    format!("{base}/reset-password?token={raw_token}")
}

#[async_trait]
impl PasswordResetService for PrincipalPasswordResetService {
    /// Request a password reset without revealing whether the email exists.
    ///
    /// ```text
    ///   Client              PasswordResetService           PrincipalRepo / Token / Email
    ///     | request(email)           |                                  |
    ///     |------------------------->|                                  |
    ///     |                          | get_principal (active only)      |
    ///     |                          |--------------------------------->|
    ///     |                          | none / inactive -> generic OK    |
    ///     |                          | active -> issue password_reset   |
    ///     |                          |--------------------------------->|
    ///     |                          | send mail with APP_PUBLIC link   |
    ///     |                          |--------------------------------->|
    ///     | generic success          |                                  |
    ///     |<-------------------------|                                  |
    /// ```
    async fn request_reset(
        &self,
        req: &PasswordResetRequestRequest,
    ) -> Result<PasswordResetRequestResponse, String> {
        let email = validate_email(&req.email)?;

        let Some(principal) = self.principal_repository.get_principal(&email).await else {
            return Ok(PasswordResetRequestResponse {
                message: GENERIC_REQUEST_MESSAGE.to_string(),
            });
        };

        if principal.tenant() != self.tenant {
            return Ok(PasswordResetRequestResponse {
                message: GENERIC_REQUEST_MESSAGE.to_string(),
            });
        }

        let Some(base_url) = self.app_public_base_url.as_ref() else {
            tracing::warn!(
                "APP_PUBLIC_BASE_URL is unset; skipping password-reset email for active user"
            );
            return Ok(PasswordResetRequestResponse {
                message: GENERIC_REQUEST_MESSAGE.to_string(),
            });
        };

        let raw_token = match self
            .email_token_service
            .issue(
                principal.user_id(),
                &self.tenant,
                EmailTokenPurpose::PasswordReset,
            )
            .await
        {
            Ok(raw) => raw,
            Err(err) => {
                tracing::error!("Failed to issue password-reset token: {err:?}");
                return Ok(PasswordResetRequestResponse {
                    message: GENERIC_REQUEST_MESSAGE.to_string(),
                });
            }
        };

        let link = reset_link(base_url, &raw_token);
        let message = EmailMessage {
            to: email,
            subject: "Reset your Life Manager password".to_string(),
            body: format!(
                "Use this link to reset your password. It expires in one hour.\n\n{link}\n"
            ),
        };

        if let Err(err) = self.email_sender.send(&message).await {
            tracing::error!("Failed to send password-reset email: {err}");
        }

        Ok(PasswordResetRequestResponse {
            message: GENERIC_REQUEST_MESSAGE.to_string(),
        })
    }

    /// Confirm a password reset with a one-time token.
    ///
    /// ```text
    ///   Client              PasswordResetService           TokenService / PrincipalRepo
    ///     | confirm(token,pw)        |                                  |
    ///     |------------------------->|                                  |
    ///     |                          | validate password length         |
    ///     |                          | consume(password_reset)          |
    ///     |                          |--------------------------------->|
    ///     |                          | [bad/expired] -> error           |
    ///     |                          | update_password hash             |
    ///     |                          |--------------------------------->|
    ///     | success                  |                                  |
    ///     |<-------------------------|                                  |
    /// ```
    async fn confirm_reset(
        &self,
        req: &PasswordResetConfirmRequest,
    ) -> Result<PasswordResetConfirmResponse, String> {
        validate_password(&req.new_password)?;

        let token = req.token.trim();
        if token.is_empty() {
            return Err(INVALID_TOKEN_MESSAGE.to_string());
        }

        let record = self
            .email_token_service
            .consume(token, EmailTokenPurpose::PasswordReset)
            .await
            .map_err(|err| match err {
                EmailTokenError::Expired | EmailTokenError::InvalidOrUsed => {
                    INVALID_TOKEN_MESSAGE.to_string()
                }
                EmailTokenError::Database => {
                    "Could not reset password. Please try again later.".to_string()
                }
            })?;

        if record.tenant != self.tenant {
            return Err(INVALID_TOKEN_MESSAGE.to_string());
        }

        let password_hash = self
            .password_hasher
            .hash_password(&req.new_password)
            .map_err(|_| "Could not reset password. Please try again later.".to_string())?;

        self.principal_repository
            .update_password(record.user_id, &password_hash)
            .await
            .map_err(|err| match err {
                UpdatePasswordError::NotFound => INVALID_TOKEN_MESSAGE.to_string(),
                UpdatePasswordError::Database => {
                    "Could not reset password. Please try again later.".to_string()
                }
            })?;

        Ok(PasswordResetConfirmResponse {
            message: CONFIRM_SUCCESS_MESSAGE.to_string(),
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
        auth_password_hasher::{AuthPasswordHasher, PasswordHashError},
        email_sender::EmailSendError,
        email_token::{EmailTokenError, EmailTokenRecord, NewEmailToken},
        email_token_repository::EmailTokenRepository,
        opaque_token_hasher::{OpaqueTokenGenerator, OpaqueTokenHasher},
        principal::{CreateUserError, Principal, PrincipalRepository, UpdatePasswordError},
    };

    struct StubPrincipal {
        id: Uuid,
        tenant: String,
        hash: String,
    }

    impl Principal for StubPrincipal {
        fn user_id(&self) -> Uuid {
            self.id
        }

        fn tenant(&self) -> &str {
            &self.tenant
        }

        fn password_hash(&self) -> &str {
            &self.hash
        }
    }

    #[derive(Default)]
    struct StubRepo {
        active: Mutex<Option<StubPrincipal>>,
        updated_hashes: Mutex<Vec<(Uuid, String)>>,
    }

    #[async_trait]
    impl PrincipalRepository for StubRepo {
        async fn get_principal(&self, username: &str) -> Option<Box<dyn Principal>> {
            let guard = self.active.lock().unwrap();
            let Some(principal) = guard.as_ref() else {
                return None;
            };
            // Username is email for signup users; stub ignores name match beyond presence.
            let _ = username;
            Some(Box::new(StubPrincipal {
                id: principal.id,
                tenant: principal.tenant.clone(),
                hash: principal.hash.clone(),
            }))
        }

        async fn create_user(
            &self,
            _username: &str,
            _password_hash: &str,
            _tenant: &str,
            _active: bool,
        ) -> Result<(), CreateUserError> {
            Ok(())
        }

        async fn update_password(
            &self,
            user_id: Uuid,
            password_hash: &str,
        ) -> Result<(), UpdatePasswordError> {
            self.updated_hashes
                .lock()
                .unwrap()
                .push((user_id, password_hash.to_string()));
            Ok(())
        }
    }

    struct StubHasher;

    impl AuthPasswordHasher for StubHasher {
        fn hash_password(&self, password: &str) -> Result<String, PasswordHashError> {
            Ok(format!("hash:{password}"))
        }

        fn verify_password(&self, _password: &str, _hashed_password: &str) -> bool {
            true
        }
    }

    #[derive(Default)]
    struct RecordingSender {
        sent: Mutex<Vec<EmailMessage>>,
    }

    #[async_trait]
    impl EmailSender for RecordingSender {
        async fn send(&self, message: &EmailMessage) -> Result<(), EmailSendError> {
            self.sent.lock().unwrap().push(message.clone());
            Ok(())
        }
    }

    struct StubHasherToken;

    impl OpaqueTokenHasher for StubHasherToken {
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
        async fn issue_replacing_unused(&self, token: NewEmailToken) -> Result<(), EmailTokenError> {
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
            if row.consumed_at.is_some() {
                return Err(EmailTokenError::InvalidOrUsed);
            }
            row.consumed_at = Some(consumed_at);
            Ok(())
        }
    }

    fn given_service(
        active: Option<StubPrincipal>,
        base_url: Option<&str>,
    ) -> (
        PrincipalPasswordResetService,
        Arc<RecordingSender>,
        Arc<StubRepo>,
        Arc<StubTokenRepo>,
    ) {
        let repo = Arc::new(StubRepo {
            active: Mutex::new(active),
            updated_hashes: Mutex::new(Vec::new()),
        });
        let sender = Arc::new(RecordingSender::default());
        let token_repo = Arc::new(StubTokenRepo::default());
        let email_token_service = Arc::new(EmailTokenService {
            repository: token_repo.clone(),
            hasher: Arc::new(StubHasherToken),
            generator: Arc::new(FixedGenerator {
                raw: "reset-raw-token".to_string(),
            }),
        });
        let service = PrincipalPasswordResetService {
            principal_repository: repo.clone(),
            password_hasher: Arc::new(StubHasher),
            email_token_service,
            email_sender: sender.clone(),
            app_public_base_url: base_url.map(|s| s.to_string()),
            tenant: "life-manager".to_string(),
        };
        (service, sender, repo, token_repo)
    }

    #[tokio::test]
    async fn given_active_user_when_requesting_reset_then_sends_mail_and_generic_success() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, sender, _, _) = given_service(
            Some(StubPrincipal {
                id: user_id,
                tenant: "life-manager".to_string(),
                hash: "old".to_string(),
            }),
            Some("https://life-manager.jeszenka.com"),
        );
        let req = PasswordResetRequestRequest {
            email: "user@example.com".to_string(),
        };

        // When
        let response = service.request_reset(&req).await.expect("request");

        // Then
        assert_eq!(response.message, GENERIC_REQUEST_MESSAGE);
        let sent = sender.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].to, "user@example.com");
        assert!(
            sent[0]
                .body
                .contains("https://life-manager.jeszenka.com/reset-password?token=reset-raw-token")
        );
    }

    #[tokio::test]
    async fn given_unknown_email_when_requesting_reset_then_same_success_and_no_mail() {
        // Given
        let (service, sender, _, _) = given_service(None, Some("https://example.com"));
        let req = PasswordResetRequestRequest {
            email: "missing@example.com".to_string(),
        };

        // When
        let response = service.request_reset(&req).await.expect("request");

        // Then
        assert_eq!(response.message, GENERIC_REQUEST_MESSAGE);
        assert!(sender.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn given_valid_token_when_confirming_then_updates_password() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, _, repo, _) = given_service(
            Some(StubPrincipal {
                id: user_id,
                tenant: "life-manager".to_string(),
                hash: "old".to_string(),
            }),
            Some("https://example.com"),
        );
        let raw = service
            .email_token_service
            .issue(user_id, "life-manager", EmailTokenPurpose::PasswordReset)
            .await
            .expect("issue");

        // When
        let response = service
            .confirm_reset(&PasswordResetConfirmRequest {
                token: raw.clone(),
                new_password: "newpassword1".to_string(),
            })
            .await
            .expect("confirm");

        // Then
        assert_eq!(response.message, CONFIRM_SUCCESS_MESSAGE);
        let updates = repo.updated_hashes.lock().unwrap();
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].0, user_id);
        assert_eq!(updates[0].1, "hash:newpassword1");

        let reuse = service
            .confirm_reset(&PasswordResetConfirmRequest {
                token: raw,
                new_password: "anotherpass1".to_string(),
            })
            .await;
        assert_eq!(reuse.err(), Some(INVALID_TOKEN_MESSAGE.to_string()));
    }

    #[tokio::test]
    async fn given_expired_token_when_confirming_then_errors_without_password_change() {
        // Given
        let user_id = Uuid::new_v4();
        let (service, _, repo, token_repo) = given_service(
            Some(StubPrincipal {
                id: user_id,
                tenant: "life-manager".to_string(),
                hash: "old".to_string(),
            }),
            Some("https://example.com"),
        );
        let now = Utc::now().naive_utc();
        token_repo.rows.lock().unwrap().push(EmailTokenRecord {
            id: Uuid::new_v4(),
            user_id,
            tenant: "life-manager".to_string(),
            purpose: EmailTokenPurpose::PasswordReset,
            token_hash: "hash:expired-token".to_string(),
            expires_at: now - Duration::seconds(1),
            consumed_at: None,
            created_at: now - Duration::hours(2),
        });

        // When
        let result = service
            .confirm_reset(&PasswordResetConfirmRequest {
                token: "expired-token".to_string(),
                new_password: "newpassword1".to_string(),
            })
            .await;

        // Then
        assert_eq!(result.err(), Some(INVALID_TOKEN_MESSAGE.to_string()));
        assert!(repo.updated_hashes.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn given_short_password_when_confirming_then_returns_validation_error() {
        // Given
        let (service, _, _, _) = given_service(None, Some("https://example.com"));

        // When
        let result = service
            .confirm_reset(&PasswordResetConfirmRequest {
                token: "any".to_string(),
                new_password: "short".to_string(),
            })
            .await;

        // Then
        assert_eq!(
            result.err(),
            Some("Password must be at least 8 characters.".to_string())
        );
    }
}
