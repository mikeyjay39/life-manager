use sha2::{Digest, Sha256};

use crate::domain::opaque_token_hasher::{OpaqueTokenGenerator, OpaqueTokenHasher};

/// SHA-256 hex digest of the raw opaque token.
pub struct Sha256TokenHasher;

impl OpaqueTokenHasher for Sha256TokenHasher {
    fn hash_token(&self, raw_token: &str) -> String {
        let digest = Sha256::digest(raw_token.as_bytes());
        to_hex(&digest)
    }
}

/// 32 crypto-secure random bytes, hex-encoded (64 chars).
pub struct OsRngOpaqueTokenGenerator;

impl OpaqueTokenGenerator for OsRngOpaqueTokenGenerator {
    fn generate_raw_token(&self) -> String {
        use password_hash::rand_core::{OsRng, RngCore};

        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        to_hex(&bytes)
    }
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn given_raw_token_when_hashing_then_returns_stable_hex_digest() {
        // Given
        let hasher = Sha256TokenHasher;
        let raw = "opaque-token-value";

        // When
        let hash1 = hasher.hash_token(raw);
        let hash2 = hasher.hash_token(raw);

        // Then
        assert_eq!(hash1, hash2);
        assert_ne!(hash1, raw);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn given_generator_when_generating_then_returns_high_entropy_hex() {
        // Given
        let generator = OsRngOpaqueTokenGenerator;

        // When
        let a = generator.generate_raw_token();
        let b = generator.generate_raw_token();

        // Then
        assert_eq!(a.len(), 64);
        assert_eq!(b.len(), 64);
        assert_ne!(a, b);
    }
}
