use dotenv::dotenv;
use once_cell::sync::OnceCell;
use reqwest::Client;
use std::env;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

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

// TODO: Reactor this and the tesseract function to remove duplicated code
async fn wait_for_ollama_ready() {
    let client = Client::new();
    let base_url = env::var("OLLAMA_URL").expect("OLLAMA_URL must be set");
    let url = format!("{}/", base_url);

    for attempt in 0..30 {
        if let Ok(resp) = client.get(&url).send().await
            && resp.status().is_success()
        {
            tracing::info!("Ollama is ready!");
            sleep(Duration::from_secs(5));
            return;
        }
        tracing::info!("Attemp {} Waiting for Ollama to become ready...", attempt);
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
            tracing::info!("Tesseract is ready!");
            return;
        }
        tracing::info!("Attemp {} Waiting for Ollama to become ready...", attempt);
        sleep(Duration::from_secs(1));
    }

    panic!("Tesseract did not become ready at {}", url);
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
