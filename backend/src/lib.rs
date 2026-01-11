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
use infrastructure::app_state::AppState;
use std::env;
use std::net::SocketAddr;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};
pub mod schema;
use rustls_pemfile::{certs, pkcs8_private_keys};
use std::{fs::File, io::BufReader};
use tokio_rustls::{
    TlsAcceptor,
    rustls::{Certificate, PrivateKey, ServerConfig},
};

#[tokio::main]
pub async fn start_server() {
    let app = build_app(None).await;

    // Define the address to run the server on
    let app_port = env::var("APP_PORT").expect("APP_PORT must be set");
    let addr = SocketAddr::from(([0, 0, 0, 0], app_port.parse().unwrap()));
    tracing::info!("Tracing Listening on http://{}", addr);

    // Run the server with TLS

    let cert_path = std::env::var("TLS_CERT_PATH").expect("TLS_CERT_PATH must be set");
    let key_path = std::env::var("TLS_KEY_PATH").expect("TLS_KEY_PATH must be set");

    let cert_file =
        &mut BufReader::new(File::open(cert_path).expect("Cannot open certificate file"));
    let key_file = &mut BufReader::new(File::open(key_path).expect("Cannot open key file"));

    let cert_chain: Vec<Certificate> = certs(cert_file)
        .unwrap()
        .into_iter()
        .map(Certificate)
        .collect();
    let mut keys: Vec<PrivateKey> = pkcs8_private_keys(key_file)
        .unwrap()
        .into_iter()
        .map(PrivateKey)
        .collect();
    let private_key = keys.remove(0);

    let config = ServerConfig::builder()
        .with_safe_defaults()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key)
        .expect("invalid TLS credentials");
    let acceptor = TlsAcceptor::from(std::sync::Arc::new(config));

    let tcp_listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    let incoming_tls_stream = tokio_stream::wrappers::TcpListenerStream::new(tcp_listener)
        .filter_map(|conn| async {
            match conn {
                Ok(stream) => match acceptor.accept(stream).await {
                    Ok(tls_stream) => Some(Ok::<_, std::io::Error>(tls_stream)),
                    Err(e) => {
                        tracing::error!("TLS error: {:?}", e);
                        None
                    }
                },
                Err(e) => {
                    tracing::error!("TCP error: {:?}", e);
                    None
                }
            }
        });
    axum::serve(incoming_tls_stream, app).await.unwrap();
}

pub async fn build_app(app_state: Option<AppState>) -> Router {
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
