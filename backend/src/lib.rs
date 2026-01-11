mod application;
mod domain;
pub mod infrastructure;
use crate::infrastructure::{
    app_state::AppStateBuilder, auth::auth_router::auth_router,
    document::document_router::document_router,
};
use axum::{
    Router,
    body::Body,
    http::{Method, Request},
    routing::get,
};
use axum_server::tls_rustls::RustlsConfig;
use infrastructure::app_state::AppState;
use std::env;
use std::net::SocketAddr;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};
pub mod schema;

use rustls::crypto::{CryptoProvider, ring};

fn install_crypto_provider() {
    CryptoProvider::install_default(ring::default_provider())
        .expect("failed to install rustls crypto provider");
}

#[tokio::main]
pub async fn start_server() {
    let app = build_app(None).await;

    // Define the address to run the server on
    let app_port = env::var("APP_PORT").expect("APP_PORT must be set");
    let addr = SocketAddr::from(([0, 0, 0, 0], app_port.parse().unwrap()));
    tracing::info!("Tracing Listening on https://{}", addr);

    // Run the server with TLS
    let cert_path = std::env::var("TLS_CERT_PATH").expect("TLS_CERT_PATH must be set");
    let key_path = std::env::var("TLS_KEY_PATH").expect("TLS_KEY_PATH must be set");

    let config = RustlsConfig::from_pem_file(cert_path, key_path)
        .await
        .expect("invalid TLS config");

    axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

pub async fn build_app(app_state: Option<AppState>) -> Router {
    tracing::info!("Building application...");
    install_crypto_provider();
    let state = match app_state {
        Some(s) => s,
        None => AppStateBuilder::new().build().await,
    };

    // logging
    tracing_subscriber::registry()
        .with(
            fmt::layer()
                .json()
                .with_timer(tracing_subscriber::fmt::time::UtcTime::rfc_3339())
                .with_ansi(false),
        )
        .try_init()
        .ok();

    Router::new()
        .route("/health", get(|| async { "up" }))
        .nest("/api/v1", rest_api_router())
        .layer(
            CorsLayer::new()
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_origin(tower_http::cors::Any),
        )
        .layer(
            ServiceBuilder::new().layer(TraceLayer::new_for_http().make_span_with(
                |request: &Request<Body>| {
                    let trace_id = uuid::Uuid::new_v4();
                    tracing::span!(
                        Level::DEBUG,
                        "request",
                        method = tracing::field::display(request.method()),
                        uri = tracing::field::display(request.uri()),
                        version = tracing::field::debug(request.version()),
                        trace_id = tracing::field::display(trace_id)
                    )
                },
            )),
        )
        .with_state(state)
}

/**
Hold the routers for domains and features.
*/
fn rest_api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth_router())
        .nest("/documents", document_router())
}
