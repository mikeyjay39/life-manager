use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::{
    auth_password_hasher::AuthPasswordHasher,
    email_message::EmailMessage,
    email_sender::EmailSender,
    email_token_purpose::EmailTokenPurpose,
    email_token_service::EmailTokenService,
    principal::{CreateUserError, PrincipalRepository},
    signup_request::{SignupRequest, SignupResponse},
    signup_service::{SignupError, SignupService},
};

const MIN_PASSWORD_LEN: usize = 8;
const SIGNUP_SUCCESS_MESSAGE: &str =
    "Account created. Check your email to verify your account before you sign in.";
const VERIFY_EMAIL_SUBJECT: &str = "Verify your Life Manager account";
const EMAIL_SEND_FAILED_MESSAGE: &str =
    "Could not send the verification email. Please try signing up again in a few minutes.";

pub struct PrincipalSignupService {
    pub principal_repository: Arc<dyn PrincipalRepository>,
    pub password_hasher: Arc<dyn AuthPasswordHasher>,
    pub email_token_service: Arc<EmailTokenService>,
    pub email_sender: Arc<dyn EmailSender>,
    pub app_public_base_url: Option<String>,
    pub tenant: String,
}

fn validate_email(email: &str) -> Result<String, SignupError> {
    let email = email.trim();
    if email.is_empty() {
        return Err(SignupError::Validation("Email is required.".to_string()));
    }

    let Some((local, domain)) = email.split_once('@') else {
        return Err(SignupError::Validation(
            "Enter a valid email address.".to_string(),
        ));
    };

    if local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err(SignupError::Validation(
            "Enter a valid email address.".to_string(),
        ));
    }

    Ok(email.to_string())
}

fn validate_password(password: &str) -> Result<(), SignupError> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(SignupError::Validation(format!(
            "Password must be at least {MIN_PASSWORD_LEN} characters."
        )));
    }
    Ok(())
}

fn build_verify_link(base_url: &str, raw_token: &str) -> String {
    let base = base_url.trim_end_matches('/');
    format!("{base}/verify-email?token={raw_token}")
}

#[async_trait]
impl SignupService for PrincipalSignupService {
    async fn signup(&self, signup_req: &SignupRequest) -> Result<SignupResponse, SignupError> {
        let email = validate_email(&signup_req.email)?;
        validate_password(&signup_req.password)?;

        let base_url = self.app_public_base_url.as_ref().ok_or_else(|| {
            SignupError::EmailSendFailed(
                "APP_PUBLIC_BASE_URL is not configured. Cannot send verification email."
                    .to_string(),
            )
        })?;

        let password_hash = self
            .password_hasher
            .hash_password(&signup_req.password)
            .map_err(|_| {
                SignupError::Validation(
                    "Could not create account. Please try again later.".to_string(),
                )
            })?;

        let user_id = self
            .principal_repository
            .create_user(&email, &password_hash, &self.tenant, false)
            .await
            .map_err(|err| match err {
                CreateUserError::DuplicateUsername => SignupError::Validation(
                    "An account with this email already exists.".to_string(),
                ),
                CreateUserError::Database => SignupError::Validation(
                    "Could not create account. Please try again later.".to_string(),
                ),
            })?;

        let issue_result = self
            .email_token_service
            .issue(user_id, &self.tenant, EmailTokenPurpose::SignupVerify)
            .await;

        let raw_token = match issue_result {
            Ok(raw) => raw,
            Err(_) => {
                self.rollback_signup(user_id).await;
                return Err(SignupError::EmailSendFailed(
                    EMAIL_SEND_FAILED_MESSAGE.to_string(),
                ));
            }
        };

        let link = build_verify_link(base_url, &raw_token);
        let body = format!(
            "Welcome to Life Manager.\n\nOpen this link to verify your email and activate your account:\n{link}\n\nIf you did not sign up, you can ignore this message."
        );
        let message = EmailMessage {
            to: email.clone(),
            subject: VERIFY_EMAIL_SUBJECT.to_string(),
            body,
        };

        if let Err(err) = self.email_sender.send(&message).await {
            tracing::error!("Signup verify email send failed: {err}");
            self.rollback_signup(user_id).await;
            return Err(SignupError::EmailSendFailed(
                EMAIL_SEND_FAILED_MESSAGE.to_string(),
            ));
        }

        Ok(SignupResponse {
            message: SIGNUP_SUCCESS_MESSAGE.to_string(),
        })
    }
}

impl PrincipalSignupService {
    async fn rollback_signup(&self, user_id: uuid::Uuid) {
        if let Err(err) = self
            .email_token_service
            .repository
            .delete_all_for_user(user_id)
            .await
        {
            tracing::error!("Failed to delete signup tokens during rollback: {err:?}");
        }
        if let Err(err) = self.principal_repository.delete_user_by_id(user_id).await {
            tracing::error!("Failed to delete signup user during rollback: {err:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use uuid::Uuid;

    use crate::domain::{
        auth_password_hasher::{AuthPasswordHasher, PasswordHashError},
        email_message::EmailMessage,
        email_sender::{EmailSendError, EmailSender},
        email_token::{EmailTokenError, EmailTokenRecord, NewEmailToken},
        email_token_purpose::EmailTokenPurpose,
        email_token_repository::EmailTokenRepository,
        email_token_service::EmailTokenService,
        opaque_token_hasher::{OpaqueTokenGenerator, OpaqueTokenHasher},
        principal::{CreateUserError, Principal, PrincipalRepository, PrincipalWriteError},
        signup_service::SignupError,
    };

    use super::*;

    struct StubRepository {
        duplicate: bool,
        last_username: Mutex<Option<String>>,
        last_active: Mutex<Option<bool>>,
        created_ids: Mutex<Vec<Uuid>>,
        deleted_ids: Mutex<Vec<Uuid>>,
    }

    #[async_trait]
    impl PrincipalRepository for StubRepository {
        async fn get_principal(&self, _username: &str) -> Option<Box<dyn Principal>> {
            None
        }

        async fn create_user(
            &self,
            username: &str,
            _password_hash: &str,
            _tenant: &str,
            active: bool,
        ) -> Result<Uuid, CreateUserError> {
            if self.duplicate {
                return Err(CreateUserError::DuplicateUsername);
            }
            *self.last_username.lock().unwrap() = Some(username.to_string());
            *self.last_active.lock().unwrap() = Some(active);
            let id = Uuid::new_v4();
            self.created_ids.lock().unwrap().push(id);
            Ok(id)
        }

        async fn update_password(
            &self,
            _user_id: Uuid,
            _password_hash: &str,
        ) -> Result<(), crate::domain::principal::UpdatePasswordError> {
            Ok(())
        }

        async fn is_active(
            &self,
            _user_id: Uuid,
        ) -> Result<bool, crate::domain::principal::UpdatePasswordError> {
            Ok(false)
        }

        async fn set_user_active_by_id(
            &self,
            _user_id: Uuid,
            _active: bool,
        ) -> Result<(), PrincipalWriteError> {
            Ok(())
        }

        async fn delete_user_by_id(&self, user_id: Uuid) -> Result<(), PrincipalWriteError> {
            self.deleted_ids.lock().unwrap().push(user_id);
            Ok(())
        }
    }

    struct StubHasher;

    impl AuthPasswordHasher for StubHasher {
        fn hash_password(&self, _password: &str) -> Result<String, PasswordHashError> {
            Ok("hashed".to_string())
        }

        fn verify_password(&self, _password: &str, _hashed_password: &str) -> bool {
            true
        }
    }

    struct StubTokenHasher;

    impl OpaqueTokenHasher for StubTokenHasher {
        fn hash_token(&self, raw_token: &str) -> String {
            format!("hash:{raw_token}")
        }
    }

    struct FixedGenerator;

    impl OpaqueTokenGenerator for FixedGenerator {
        fn generate_raw_token(&self) -> String {
            "signup-raw-token".to_string()
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
            _token_hash: &str,
            _purpose: EmailTokenPurpose,
        ) -> Result<Option<EmailTokenRecord>, EmailTokenError> {
            Ok(None)
        }

        async fn mark_consumed(
            &self,
            _id: Uuid,
            _consumed_at: chrono::NaiveDateTime,
        ) -> Result<(), EmailTokenError> {
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

    struct RecordingSender {
        fail: bool,
        sent: Mutex<Vec<EmailMessage>>,
    }

    #[async_trait]
    impl EmailSender for RecordingSender {
        async fn send(&self, message: &EmailMessage) -> Result<(), EmailSendError> {
            if self.fail {
                return Err(EmailSendError::Provider("boom".to_string()));
            }
            self.sent.lock().unwrap().push(message.clone());
            Ok(())
        }
    }

    fn given_service(
        duplicate: bool,
        fail_send: bool,
    ) -> (PrincipalSignupService, Arc<StubRepository>, Arc<RecordingSender>) {
        let principal_repository = Arc::new(StubRepository {
            duplicate,
            last_username: Mutex::new(None),
            last_active: Mutex::new(None),
            created_ids: Mutex::new(Vec::new()),
            deleted_ids: Mutex::new(Vec::new()),
        });
        let email_sender = Arc::new(RecordingSender {
            fail: fail_send,
            sent: Mutex::new(Vec::new()),
        });
        let service = PrincipalSignupService {
            principal_repository: principal_repository.clone(),
            password_hasher: Arc::new(StubHasher),
            email_token_service: Arc::new(EmailTokenService {
                repository: Arc::new(StubTokenRepo::default()),
                hasher: Arc::new(StubTokenHasher),
                generator: Arc::new(FixedGenerator),
            }),
            email_sender: email_sender.clone(),
            app_public_base_url: Some("https://life-manager.jeszenka.com".to_string()),
            tenant: "life-manager".to_string(),
        };
        (service, principal_repository, email_sender)
    }

    #[tokio::test]
    async fn given_valid_signup_when_creating_user_then_sends_verify_email() {
        // Given
        let (service, principals, sender) = given_service(false, false);
        let req = SignupRequest {
            email: " user@example.com ".to_string(),
            password: "password123".to_string(),
        };

        // When
        let response = service.signup(&req).await.expect("Signup should succeed");

        // Then
        assert!(response.message.contains("Check your email"));
        assert_eq!(principals.last_active.lock().unwrap().as_ref(), Some(&false));
        let sent = sender.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].to, "user@example.com");
        assert!(
            sent[0]
                .body
                .contains("https://life-manager.jeszenka.com/verify-email?token=signup-raw-token")
        );
    }

    #[tokio::test]
    async fn given_send_failure_when_signing_up_then_rolls_back_user() {
        // Given
        let (service, principals, _) = given_service(false, true);
        let req = SignupRequest {
            email: "user@example.com".to_string(),
            password: "password123".to_string(),
        };

        // When
        let result = service.signup(&req).await;

        // Then
        assert!(matches!(result, Err(SignupError::EmailSendFailed(_))));
        let created = principals.created_ids.lock().unwrap().clone();
        let deleted = principals.deleted_ids.lock().unwrap().clone();
        assert_eq!(created, deleted);
    }

    #[tokio::test]
    async fn given_duplicate_email_when_signing_up_then_returns_duplicate_error() {
        // Given
        let (service, _, _) = given_service(true, false);
        let req = SignupRequest {
            email: "user@example.com".to_string(),
            password: "password123".to_string(),
        };

        // When
        let result = service.signup(&req).await;

        // Then
        assert_eq!(
            result.err(),
            Some(SignupError::Validation(
                "An account with this email already exists.".to_string()
            ))
        );
    }

    #[tokio::test]
    async fn given_invalid_email_when_signing_up_then_returns_validation_error() {
        // Given
        let (service, _, _) = given_service(false, false);
        let req = SignupRequest {
            email: "not-an-email".to_string(),
            password: "password123".to_string(),
        };

        // When
        let result = service.signup(&req).await;

        // Then
        assert_eq!(
            result.err(),
            Some(SignupError::Validation(
                "Enter a valid email address.".to_string()
            ))
        );
    }

    #[tokio::test]
    async fn given_short_password_when_signing_up_then_returns_validation_error() {
        // Given
        let (service, _, _) = given_service(false, false);
        let req = SignupRequest {
            email: "user@example.com".to_string(),
            password: "short".to_string(),
        };

        // When
        let result = service.signup(&req).await;

        // Then
        assert_eq!(
            result.err(),
            Some(SignupError::Validation(
                "Password must be at least 8 characters.".to_string()
            ))
        );
    }
}
