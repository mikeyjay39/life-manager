use std::{env, sync::OnceLock};

use anyhow::Context;
use zeroize::Zeroizing;

static JWT_SECRET: OnceLock<Zeroizing<Vec<u8>>> = OnceLock::new();

pub fn jwt_secret() -> anyhow::Result<&'static Zeroizing<Vec<u8>>> {
    if let Some(secret) = JWT_SECRET.get() {
        return Ok(secret);
    }

    let value = env::var("JWT_SECRET").context("Failed to load JWT_SECRET env var")?;
    let _ = JWT_SECRET.set(Zeroizing::new(value.into_bytes()));
    JWT_SECRET
        .get()
        .context("Failed to load JWT_SECRET env var")
}
