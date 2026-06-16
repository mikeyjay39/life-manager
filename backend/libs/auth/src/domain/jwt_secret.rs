use std::{env, sync::LazyLock};

use zeroize::Zeroizing;

pub static JWT_SECRET: LazyLock<Zeroizing<Vec<u8>>> = LazyLock::new(|| {
    Zeroizing::new(
        env::var("JWT_SECRET")
            .expect("Failed to load JWT_SECRET env var")
            .into_bytes(),
    )
});
