use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn compose_file() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../docker-compose.yml")
}

/// Stops the docker-compose services.
pub fn docker_compose_down() {
    println!("Stopping docker-compose...");
    let compose = compose_file();
    let _ = Command::new("docker")
        .args([
            "compose",
            "-f",
            compose.to_str().expect("compose path utf-8"),
            "down",
            "-v",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();
    println!("docker-compose stopped.");
}
