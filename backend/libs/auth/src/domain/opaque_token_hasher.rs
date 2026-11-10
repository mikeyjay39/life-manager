/// Fast hash of a high-entropy opaque token. Store only the digest.
pub trait OpaqueTokenHasher: Sync + Send {
    fn hash_token(&self, raw_token: &str) -> String;
}

/// Crypto-secure generator of opaque raw tokens shown once to the caller.
pub trait OpaqueTokenGenerator: Sync + Send {
    fn generate_raw_token(&self) -> String;
}
