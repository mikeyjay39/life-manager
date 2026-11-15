use chrono::Duration;

/// Purpose of a one-time auth email token.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EmailTokenPurpose {
    SignupVerify,
    PasswordReset,
}

impl EmailTokenPurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SignupVerify => "signup_verify",
            Self::PasswordReset => "password_reset",
        }
    }

    /// Default TTL for a newly issued token of this purpose.
    pub fn default_ttl(self) -> Duration {
        match self {
            Self::SignupVerify => Duration::hours(24),
            Self::PasswordReset => Duration::hours(1),
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "signup_verify" => Some(Self::SignupVerify),
            "password_reset" => Some(Self::PasswordReset),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_purpose_when_as_str_then_matches_locked_values() {
        assert_eq!(EmailTokenPurpose::SignupVerify.as_str(), "signup_verify");
        assert_eq!(EmailTokenPurpose::PasswordReset.as_str(), "password_reset");
    }

    #[test]
    fn given_purpose_when_default_ttl_then_matches_locked_windows() {
        assert_eq!(
            EmailTokenPurpose::SignupVerify.default_ttl(),
            Duration::hours(24)
        );
        assert_eq!(
            EmailTokenPurpose::PasswordReset.default_ttl(),
            Duration::hours(1)
        );
    }
}
