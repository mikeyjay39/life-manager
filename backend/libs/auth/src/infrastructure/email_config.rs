use std::env;
use std::path::PathBuf;

use anyhow::{Context, bail};
use zeroize::Zeroizing;

/// Supported outbound email providers.
///
/// Resend credentials live on the `Resend` variant so a Resend config without
/// an API key or from-address cannot be constructed.
/// Capture stores the sink directory on the `Capture` variant.
#[derive(Clone, PartialEq, Eq)]
pub enum EmailProvider {
    Log,
    /// Writes full message bodies (including verify/reset links) to disk for e2e.
    Capture {
        capture_dir: PathBuf,
    },
    Resend {
        api_key: Zeroizing<String>,
        email_from: String,
    },
}

impl std::fmt::Debug for EmailProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Log => f.write_str("Log"),
            Self::Capture { capture_dir } => f
                .debug_struct("Capture")
                .field("capture_dir", capture_dir)
                .finish(),
            Self::Resend { email_from, .. } => f
                .debug_struct("Resend")
                .field("api_key", &"[redacted]")
                .field("email_from", email_from)
                .finish(),
        }
    }
}

/// Env-backed email settings for auth composition.
///
/// Custom `Debug` redacts `RESEND_API_KEY` via [`EmailProvider`].
#[derive(Clone, Debug)]
pub struct EmailConfig {
    pub provider: EmailProvider,
    pub app_public_base_url: Option<String>,
}

impl EmailConfig {
    /// Loads email settings from process env.
    ///
    /// Defaults `EMAIL_PROVIDER` to `log` when unset so local stacks and tests
    /// need no Resend credentials.
    pub fn from_env() -> anyhow::Result<Self> {
        let provider_raw = env::var("EMAIL_PROVIDER").unwrap_or_else(|_| "log".to_string());
        let provider_kind = parse_provider_kind(&provider_raw)?;

        let provider = match provider_kind {
            ProviderKind::Log => EmailProvider::Log,
            ProviderKind::Capture => EmailProvider::Capture {
                capture_dir: require_capture_dir()?,
            },
            ProviderKind::Resend => try_resend_provider(
                optional_non_empty_env("RESEND_API_KEY")?,
                optional_non_empty_env("EMAIL_FROM")?,
            )?,
        };

        let app_public_base_url = optional_non_empty_env("APP_PUBLIC_BASE_URL")?;

        Ok(Self {
            provider,
            app_public_base_url,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderKind {
    Log,
    Capture,
    Resend,
}

fn parse_provider_kind(raw: &str) -> anyhow::Result<ProviderKind> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "log" => Ok(ProviderKind::Log),
        // `file` is an accepted alias for capture (issue #259 naming).
        "capture" | "file" => Ok(ProviderKind::Capture),
        "resend" => Ok(ProviderKind::Resend),
        other => {
            bail!("EMAIL_PROVIDER must be 'log', 'capture', 'file', or 'resend', got '{other}'")
        }
    }
}

fn require_capture_dir() -> anyhow::Result<PathBuf> {
    let raw = optional_non_empty_env("EMAIL_CAPTURE_DIR")?.ok_or_else(|| {
        anyhow::anyhow!("EMAIL_CAPTURE_DIR must be set when EMAIL_PROVIDER is capture")
    })?;
    Ok(PathBuf::from(raw))
}

fn optional_non_empty_env(name: &str) -> anyhow::Result<Option<String>> {
    match env::var(name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        Err(env::VarError::NotPresent) => Ok(None),
        Err(err) => Err(err).with_context(|| format!("Failed to read {name} env var")),
    }
}

/// Builds a Resend provider when both credentials are present (test + from_env helper).
fn try_resend_provider(
    api_key: Option<String>,
    email_from: Option<String>,
) -> anyhow::Result<EmailProvider> {
    let api_key = api_key.filter(|v| !v.trim().is_empty()).ok_or_else(|| {
        anyhow::anyhow!("RESEND_API_KEY must be set when EMAIL_PROVIDER is resend")
    })?;
    let email_from = email_from
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("EMAIL_FROM must be set when EMAIL_PROVIDER is resend"))?;
    Ok(EmailProvider::Resend {
        api_key: Zeroizing::new(api_key.trim().to_string()),
        email_from: email_from.trim().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_empty_provider_name_when_parsing_then_defaults_path_uses_log() {
        // Given / When — AuthStateBuilder uses unwrap_or("log") before parse.
        let kind = parse_provider_kind("log").expect("log is valid");
        // Then
        assert_eq!(kind, ProviderKind::Log);
    }

    #[test]
    fn given_resend_without_api_key_when_building_provider_then_names_missing_config() {
        // Given / When
        let err = try_resend_provider(None, Some("Life Manager <noreply@example.com>".to_string()))
            .expect_err("missing key must fail");
        // Then
        let message = format!("{err:#}");
        assert!(
            message.contains("RESEND_API_KEY"),
            "error should name RESEND_API_KEY, got: {message}"
        );
    }

    #[test]
    fn given_resend_without_from_when_building_provider_then_names_missing_config() {
        // Given / When
        let err = try_resend_provider(Some("re_test".to_string()), None)
            .expect_err("missing from must fail");
        // Then
        let message = format!("{err:#}");
        assert!(
            message.contains("EMAIL_FROM"),
            "error should name EMAIL_FROM, got: {message}"
        );
    }

    #[test]
    fn given_unknown_provider_when_parsing_then_fails_clearly() {
        // When
        let err = parse_provider_kind("smtp").expect_err("unknown provider must fail");
        // Then
        let message = format!("{err:#}");
        assert!(
            message.contains("EMAIL_PROVIDER"),
            "error should name EMAIL_PROVIDER, got: {message}"
        );
    }

    #[test]
    fn given_resend_with_key_and_from_when_building_provider_then_ok() {
        // Given / When
        let provider = try_resend_provider(
            Some("re_test".to_string()),
            Some("noreply@example.com".to_string()),
        )
        .expect("valid resend config");
        // Then
        match provider {
            EmailProvider::Resend { email_from, .. } => {
                assert_eq!(email_from, "noreply@example.com");
            }
            EmailProvider::Log | EmailProvider::Capture { .. } => panic!("expected Resend"),
        }
    }

    #[test]
    fn given_capture_or_file_when_parsing_then_ok() {
        assert_eq!(
            parse_provider_kind("capture").expect("capture"),
            ProviderKind::Capture
        );
        assert_eq!(
            parse_provider_kind("file").expect("file alias"),
            ProviderKind::Capture
        );
    }

    #[test]
    fn given_capture_without_dir_when_requiring_then_names_env() {
        // Given — clear EMAIL_CAPTURE_DIR; restore afterward.
        let previous = std::env::var("EMAIL_CAPTURE_DIR").ok();
        unsafe {
            std::env::remove_var("EMAIL_CAPTURE_DIR");
        }
        // When
        let err = require_capture_dir().expect_err("missing dir");
        // Then
        let message = format!("{err:#}");
        assert!(
            message.contains("EMAIL_CAPTURE_DIR"),
            "error should name EMAIL_CAPTURE_DIR, got: {message}"
        );
        unsafe {
            match previous {
                Some(value) => std::env::set_var("EMAIL_CAPTURE_DIR", value),
                None => std::env::remove_var("EMAIL_CAPTURE_DIR"),
            }
        }
    }

    #[test]
    fn given_api_key_when_debug_formatting_then_redacts_secret() {
        // Given
        let config = EmailConfig {
            provider: EmailProvider::Resend {
                api_key: Zeroizing::new("re_secret_value".to_string()),
                email_from: "noreply@example.com".to_string(),
            },
            app_public_base_url: None,
        };
        // When
        let debug = format!("{config:?}");
        // Then
        assert!(debug.contains("[redacted]"));
        assert!(!debug.contains("re_secret_value"));
    }
}
