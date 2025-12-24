use once_cell::sync::OnceCell;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

/// Guard that tears down docker-compose when tests finish
pub struct DockerComposeGuard;

impl Drop for DockerComposeGuard {
    fn drop(&mut self) {
        println!("Stopping docker-compose...");
        let _ = Command::new("docker-compose").args(["down", "-v"]).status();
    }
}

static DOCKER: OnceCell<DockerComposeGuard> = OnceCell::new();

pub fn start_docker_compose() {
    DOCKER.get_or_init(|| {
        println!("Starting docker-compose...");

        let status = Command::new("docker-compose")
            .args(["up", "-d"])
            .status()
            .expect("failed to start docker-compose");

        assert!(status.success());

        wait_for_services();

        DockerComposeGuard // FIXME: This is not shutting down the containers like it should
    });
}

fn wait_for_services() {
    // Replace with real health checks if possible
    sleep(Duration::from_secs(10)); // HACK: This should poll the containers instead of sleeping
}
