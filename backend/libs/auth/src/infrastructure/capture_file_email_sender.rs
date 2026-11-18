use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{
    email_message::EmailMessage,
    email_sender::{EmailSendError, EmailSender},
};

/// E2e / local adapter: writes the full message (including body links) to disk.
///
/// No outbound HTTP. Playwright and helpers read files under `capture_dir`.
///
/// ```text
/// EmailSender::send
///      |
///      v
/// CaptureFileEmailSender
///      |
///      +--> create capture_dir if missing
///      |
///      +--> write unique .eml (To / Subject / blank line / body)
/// ```
pub struct CaptureFileEmailSender {
    capture_dir: PathBuf,
}

impl CaptureFileEmailSender {
    pub fn new(capture_dir: impl Into<PathBuf>) -> Self {
        Self {
            capture_dir: capture_dir.into(),
        }
    }

    pub fn capture_dir(&self) -> &Path {
        &self.capture_dir
    }

    /// Creates `capture_dir` when it is missing.
    fn ensure_capture_dir(&self) -> Result<(), EmailSendError> {
        fs::create_dir_all(&self.capture_dir).map_err(|err| {
            EmailSendError::Provider(format!(
                "EMAIL_CAPTURE_DIR create failed ({}): {err}",
                self.capture_dir.display()
            ))
        })
    }

    /// Builds a unique `.eml` path under `capture_dir` for this message.
    fn unique_path(&self, message: &EmailMessage) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let safe_to: String = message
            .to
            .as_str()
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let name = format!("{millis}-{safe_to}-{}.eml", Uuid::new_v4());
        self.capture_dir.join(name)
    }

    fn render_file(message: &EmailMessage) -> String {
        format!(
            "To: {}\nSubject: {}\n\n{}\n",
            message.to, message.subject, message.body
        )
    }
}

#[async_trait]
impl EmailSender for CaptureFileEmailSender {
    async fn send(&self, message: &EmailMessage) -> Result<(), EmailSendError> {
        self.ensure_capture_dir()?;
        let path = self.unique_path(message);
        let contents = Self::render_file(message);
        fs::write(&path, contents).map_err(|err| {
            EmailSendError::Provider(format!(
                "EMAIL_CAPTURE_DIR write failed ({}): {err}",
                path.display()
            ))
        })?;
        tracing::info!(
            to = %message.to,
            subject = %message.subject,
            path = %path.display(),
            "CaptureFileEmailSender: wrote full message (no Resend)"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use backend_utils::EmailAddress;

    use super::*;

    fn temp_capture_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lm-capture-{}-{}",
            label,
            Uuid::new_v4()
        ));
        dir
    }

    #[tokio::test]
    async fn given_capture_dir_when_sending_then_writes_full_body_with_link() {
        // Given
        let dir = temp_capture_dir("ok");
        let sender = CaptureFileEmailSender::new(&dir);
        let body =
            "Open http://localhost:8100/verify-email?token=secret-token-abc to verify.".to_string();
        let message = EmailMessage {
            to: EmailAddress::parse("user@example.com").expect("valid email"),
            subject: "Verify your Life Manager account".to_string(),
            body: body.clone(),
        };

        // When
        sender.send(&message).await.expect("capture send succeeds");

        // Then
        let entries: Vec<_> = fs::read_dir(&dir)
            .expect("dir exists")
            .collect::<Result<Vec<_>, _>>()
            .expect("read dir");
        assert_eq!(entries.len(), 1, "one capture file");
        let text = fs::read_to_string(entries[0].path()).expect("read capture");
        assert!(text.contains("To: user@example.com"));
        assert!(text.contains("Subject: Verify your Life Manager account"));
        assert!(text.contains("secret-token-abc"));
        assert!(text.contains(&body));
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn given_missing_capture_dir_when_sending_then_creates_dir() {
        // Given
        let dir = temp_capture_dir("mkdir");
        assert!(!dir.exists());
        let sender = CaptureFileEmailSender::new(&dir);
        let message = EmailMessage {
            to: EmailAddress::parse("new@example.com").expect("valid email"),
            subject: "Reset your Life Manager password".to_string(),
            body: "http://localhost:8100/reset-password?token=reset-1".to_string(),
        };

        // When
        sender.send(&message).await.expect("creates dir and writes");

        // Then
        assert!(dir.is_dir());
        let count = fs::read_dir(&dir).expect("dir").count();
        assert_eq!(count, 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn given_two_sends_when_capturing_then_unique_filenames() {
        // Given
        let dir = temp_capture_dir("parallel");
        let sender = CaptureFileEmailSender::new(&dir);
        let message = EmailMessage {
            to: EmailAddress::parse("a@example.com").expect("valid email"),
            subject: "Verify your Life Manager account".to_string(),
            body: "link-a".to_string(),
        };

        // When
        sender.send(&message).await.expect("first");
        sender.send(&message).await.expect("second");

        // Then
        let names: Vec<_> = fs::read_dir(&dir)
            .expect("dir")
            .map(|e| e.expect("entry").file_name())
            .collect();
        assert_eq!(names.len(), 2);
        assert_ne!(names[0], names[1]);
        let _ = fs::remove_dir_all(&dir);
    }
}
