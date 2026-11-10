use std::env;

use anyhow::{Context, bail};
use zeroize::Zeroizing;

/// Supported outbound email providers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmailProvider {
    Log,
    Resend,
}

/// Env-backed email settings for auth composition.
#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub provider: EmailProvider,
    pub resend_api_key: Option<Zeroizing<String>>,
    pub email_from: Option<String>,
    pub app_public_base_url: Option<String>,
}

impl EmailConfig {
    /// Loads email settings from process env.
    ///
    /// Defaults `EMAIL_PROVIDER` to `log` when unset so local stacks and tests
    /// need no Resend credentials.
    pub fn from_env() -> anyhow::Result<Self> {
        let provider_raw = env::var("EMAIL_PROVIDER").unwrap_or_else(|_| "log".to_string());
        let provider = parse_provider(&provider_raw)?;

        let resend_api_key = match env::var("RESEND_API_KEY") {
            Ok(value) if !value.trim().is_empty() => Some(Zeroizing::new(value)),
            Ok(_) | Err(env::VarError::NotPresent) => None,
            Err(err) => {
                return Err(err).context("Failed to read RESEND_API_KEY env var");
            }
        };

        let email_from = optional_non_empty_env("EMAIL_FROM")?;
        let app_public_base_url = optional_non_empty_env("APP_PUBLIC_BASE_URL")?;

        let config = Self {
            provider,
            resend_api_key,
            email_from,
            app_public_base_url,
        };
        config.validate()?;
        Ok(config)
    }

    /// Validates provider-specific required settings.
    pub fn validate(&self) -> anyhow::Result<()> {
        if self.provider == EmailProvider::Resend {
            if self.resend_api_key.is_none() {
                bail!("RESEND_API_KEY must be set when EMAIL_PROVIDER is resend");
            }
            if self.email_from.is_none() {
                bail!("EMAIL_FROM must be set when EMAIL_PROVIDER is resend");
            }
        }
        Ok(())
    }
}

fn parse_provider(raw: &str) -> anyhow::Result<EmailProvider> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "log" => Ok(EmailProvider::Log),
        "resend" => Ok(EmailProvider::Resend),
        other => bail!("EMAIL_PROVIDER must be 'log' or 'resend', got '{other}'"),
    }
}

fn optional_non_empty_env(name: &str) -> anyhow::Result<Option<String>> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) | Err(env::VarError::NotPresent) => Ok(None),
        Err(err) => Err(err).with_context(|| format!("Failed to read {name} env var")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_empty_provider_name_when_parsing_then_defaults_path_uses_log() {
        // Given / When — AuthStateBuilder uses unwrap_or("log") before parse.
        let provider = parse_provider("log").expect("log is valid");
        // Then
        assert_eq!(provider, EmailProvider::Log);
    }

    #[test]
    fn given_resend_without_api_key_when_validating_then_names_missing_config() {
        // Given
        let config = EmailConfig {
            provider: EmailProvider::Resend,
            resend_api_key: None,
            email_from: Some("Life Manager <noreply@example.com>".to_string()),
            app_public_base_url: None,
        };
        // When
        let err = config.validate().expect_err("missing key must fail");
        // Then
        let message = format!("{err:#}");
        assert!(
            message.contains("RESEND_API_KEY"),
            "error should name RESEND_API_KEY, got: {message}"
        );
    }

    #[test]
    fn given_unknown_provider_when_parsing_then_fails_clearly() {
        // When
        let err = parse_provider("smtp").expect_err("unknown provider must fail");
        // Then
        let message = format!("{err:#}");
        assert!(
            message.contains("EMAIL_PROVIDER"),
            "error should name EMAIL_PROVIDER, got: {message}"
        );
    }

    #[test]
    fn given_resend_with_key_and_from_when_validating_then_ok() {
        // Given
        let config = EmailConfig {
            provider: EmailProvider::Resend,
            resend_api_key: Some(Zeroizing::new("re_test".to_string())),
            email_from: Some("noreply@example.com".to_string()),
            app_public_base_url: Some("https://example.com".to_string()),
        };
        // When / Then
        config.validate().expect("valid resend config");
    }
}
