use dotenv::dotenv;
use once_cell::sync::OnceCell;
use std::env;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

use crate::common::setup::wait_for_service_to_be_ready;

/**
* Stops the docker-compose services.
* WARNING: Starting the Ollama container is an expensive process that needs to download models
* which are several GBs in size. Therefore, avoid stopping and starting the services frequently
* during tests.
*/
pub fn docker_compose_down() {
    println!("Stopping docker-compose...");
    let _ = Command::new("docker-compose").args(["down", "-v"]).status();
    println!("docker-compose stopped.");
}

static DOCKER: OnceCell<()> = OnceCell::new();

pub async fn start_docker_compose() {
    dotenv().ok();
    DOCKER.get_or_init(|| {
        println!("Starting docker-compose...");

        let status = Command::new("docker-compose")
            .args(["up", "-d"])
            .status()
            .expect("failed to start docker-compose");

        // HACK: Ollama needs to download the Llama2 model which can take a while. Health checks
        // still return 200 even if the model is not yet downloaded.
        sleep(Duration::from_secs(300));
        assert!(status.success());
    });

    wait_for_services().await;
}

async fn wait_for_services() {
    wait_for_ollama_ready().await;
    wait_for_postgres(None);
    wait_for_tesseract_ready().await;
}

async fn wait_for_ollama_ready() {
    let base_url = env::var("OLLAMA_URL").expect("OLLAMA_URL must be set");
    let url = format!("{}/", base_url);
    wait_for_service_to_be_ready(&url, "OLLAMA").await;
}

async fn wait_for_tesseract_ready() {
    let base_url = env::var("TESSERACT_URL").expect("TESSERACT_URL must be set");
    let url = format!("{}/", base_url);
    wait_for_service_to_be_ready(&url, "TESSERACT").await;
}

fn wait_for_postgres(container: Option<&str>) {
    let container = container.unwrap_or("postgres_container");
    for _ in 0..30 {
        let output = Command::new("docker")
            .args(["inspect", "--format={{.State.Health.Status}}", container])
            .output()
            .expect("docker inspect failed");

        if output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "healthy" {
            tracing::info!("Postgres container is healthy");
            return;
        }

        sleep(Duration::from_secs(1));
    }

    panic!("Postgres container never became healthy");
}
