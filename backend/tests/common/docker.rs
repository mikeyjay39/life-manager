use dotenv::dotenv;
use once_cell::sync::{Lazy, OnceCell};
use reqwest::Client;
use std::env;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

static REGISTERED: OnceCell<()> = OnceCell::new();

pub fn register_cleanup() {
    REGISTERED.get_or_init(|| unsafe {
        libc::atexit(cleanup);
    });
}

extern "C" fn cleanup() {
    println!("🧹 Running global test cleanup");

    println!("Stopping docker-compose...");
    let _ = Command::new("docker-compose").args(["down", "-v"]).status();
    println!("docker-compose stopped.");
}

/// Guard that tears down docker-compose when tests finish
pub struct DockerComposeGuard;

impl Drop for DockerComposeGuard {
    fn drop(&mut self) {
        println!("Stopping docker-compose...");
        let _ = Command::new("docker-compose").args(["down", "-v"]).status();
        println!("docker-compose stopped.");
    }
}

static DOCKER: OnceCell<DockerComposeGuard> = OnceCell::new();
static CLEANUP: Lazy<DockerComposeGuard> = Lazy::new(|| DockerComposeGuard);

pub async fn start_docker_compose() {
    dotenv().ok();
    register_cleanup();
    DOCKER.get_or_init(|| {
        println!("Starting docker-compose...");

        let status = Command::new("docker-compose")
            .args(["up", "-d"])
            .status()
            .expect("failed to start docker-compose");

        assert!(status.success());

        DockerComposeGuard // FIXME: This is not shutting down the containers like it should
    });

    wait_for_services().await;
    Lazy::force(&CLEANUP);
}

async fn wait_for_services() {
    // Replace with real health checks if possible
    wait_for_tesseract_ready().await;
    wait_for_ollama_ready().await;
}

// TODO: Reactor this and the tessearct function to remove duplicated code
async fn wait_for_ollama_ready() {
    let client = Client::new();
    let base_url = env::var("OLLAMA_URL").expect("OLLAMA_URL must be set");
    let url = format!("{}/", base_url);

    for attempt in 0..30 {
        if let Ok(resp) = client.get(&url).send().await
            && resp.status().is_success()
        {
            println!("Ollama is ready!");
            return;
        }
        println!("Attemp {} Waiting for Ollama to become ready...", attempt);
        sleep(Duration::from_secs(1));
    }

    panic!("Ollama did not become ready at {}", url);
}

async fn wait_for_tesseract_ready() {
    let client = Client::new();
    let base_url = env::var("TESSERACT_URL").expect("TESSERACT_URL must be set");
    let url = format!("{}/", base_url);

    for attempt in 0..30 {
        if let Ok(resp) = client.get(&url).send().await
            && resp.status().is_success()
        {
            println!("Tesseract is ready!");
            return;
        }
        println!("Attemp {} Waiting for Ollama to become ready...", attempt);
        sleep(Duration::from_secs(1));
    }

    panic!("Tesseract did not become ready at {}", url);
}
