use dotenv::dotenv;
use once_cell::sync::OnceCell;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::Duration;

use crate::common::setup::wait_for_service_to_be_ready;

fn compose_file() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../docker-compose.yml")
}

/// Stops the docker-compose services.
/// WARNING: Starting the Ollama container is an expensive process that needs to download models
/// which are several GBs in size. Therefore, avoid stopping and starting the services frequently
/// during tests.
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

#[allow(dead_code)]
static DOCKER: OnceCell<()> = OnceCell::new();

/// Used by `run_test_with_all_containers` (heavy / ignored integration path).
#[allow(dead_code)]
pub async fn start_docker_compose_dev_profile() {
    dotenv().ok();
    DOCKER.get_or_init(|| {
        println!("Starting docker compose...");

        let compose = compose_file();
        let status = Command::new("docker")
            .args([
                "compose",
                "-f",
                compose.to_str().expect("compose path utf-8"),
                "--profile",
                "dev",
                "up",
                "-d",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .expect("failed to start docker-compose");

        // HACK: Ollama needs to download the Llama2 model which can take a while. Health checks
        // still return 200 even if the model is not yet downloaded.
        sleep(Duration::from_secs(300));
        assert!(status.success());
    });

    wait_for_ollama_ready().await;
}

#[allow(dead_code)]
async fn wait_for_ollama_ready() {
    let base_url = env::var("OLLAMA_URL").expect("OLLAMA_URL must be set");
    let url = format!("{}/", base_url);
    wait_for_service_to_be_ready(&url, "OLLAMA").await;
}
