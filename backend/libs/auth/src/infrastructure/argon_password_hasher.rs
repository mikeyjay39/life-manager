use argon2::{
    Argon2, PasswordHasher, PasswordVerifier,
    password_hash::{PasswordHash, SaltString, rand_core::OsRng},
};
use async_trait::async_trait;

use crate::domain::auth_password_hasher::AuthPasswordHasher;

pub struct ArgonPasswordHasher;

#[async_trait]
impl AuthPasswordHasher for ArgonPasswordHasher {
    fn hash_password(&self, password: &str) -> String {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        argon2
            .hash_password(password.as_bytes(), &salt)
            .unwrap()
            .to_string()
    }

    fn verify_password(&self, password: &str, hash: &str) -> bool {
        let parsed_hash = match PasswordHash::new(hash) {
            Ok(hash) => hash,
            Err(_) => return false,
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_password_when_hashing_then_verify_succeeds() {
        // Given
        let hasher = ArgonPasswordHasher;
        let password = "s3cret-password";

        // When
        let hash = hasher.hash_password(password);

        // Then
        assert!(hasher.verify_password(password, &hash));
    }

    #[test]
    fn given_wrong_password_when_verifying_then_fails() {
        // Given
        let hasher = ArgonPasswordHasher;
        let hash = hasher.hash_password("correct-password");

        // When / Then
        assert!(!hasher.verify_password("wrong-password", &hash));
    }

    #[test]
    fn given_invalid_hash_when_verifying_then_fails() {
        // Given
        let hasher = ArgonPasswordHasher;

        // When / Then
        assert!(!hasher.verify_password("password", "not-a-valid-hash"));
    }

    #[test]
    fn given_same_password_when_hashing_twice_then_produces_different_hashes() {
        // Given
        let hasher = ArgonPasswordHasher;
        let password = "same-password";

        // When
        let hash1 = hasher.hash_password(password);
        let hash2 = hasher.hash_password(password);

        // Then — salts differ so hashes differ, but both verify
        assert_ne!(hash1, hash2);
        assert!(hasher.verify_password(password, &hash1));
        assert!(hasher.verify_password(password, &hash2));
    }
}
