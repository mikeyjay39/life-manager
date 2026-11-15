/// Validated email address value object for shared use across crates.
///
/// Construction only via [`EmailAddress::parse`]. Rules stay pragmatic (non-empty,
/// one `@`, non-empty local/domain, domain contains `.`) — not full RFC 5322.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EmailAddress(String);

/// Why [`EmailAddress::parse`] rejected the input.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum EmailAddressError {
    #[error("Email is required.")]
    Empty,
    #[error("Enter a valid email address.")]
    Invalid,
}

impl EmailAddress {
    /// Trim and validate `raw`. On success, stores the trimmed address.
    pub fn parse(raw: &str) -> Result<Self, EmailAddressError> {
        let email = raw.trim();
        if email.is_empty() {
            return Err(EmailAddressError::Empty);
        }

        let Some((local, domain)) = email.split_once('@') else {
            return Err(EmailAddressError::Invalid);
        };

        if local.is_empty() || domain.is_empty() || !domain.contains('.') {
            return Err(EmailAddressError::Invalid);
        }

        Ok(Self(email.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for EmailAddress {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl std::fmt::Display for EmailAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_valid_email_when_parsing_then_ok() {
        let email = EmailAddress::parse("  user@example.com  ").expect("valid");
        assert_eq!(email.as_str(), "user@example.com");
    }

    #[test]
    fn given_empty_when_parsing_then_empty_error() {
        assert_eq!(
            EmailAddress::parse("   ").expect_err("blank"),
            EmailAddressError::Empty
        );
    }

    #[test]
    fn given_missing_at_when_parsing_then_invalid() {
        assert_eq!(
            EmailAddress::parse("userexample.com").expect_err("no at"),
            EmailAddressError::Invalid
        );
    }

    #[test]
    fn given_domain_without_dot_when_parsing_then_invalid() {
        assert_eq!(
            EmailAddress::parse("user@localhost").expect_err("no dot"),
            EmailAddressError::Invalid
        );
    }
}
