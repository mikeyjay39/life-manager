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
    http::{header, Method, Request},
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

#[tokio::main]
pub async fn start_server() {
    tracing::info!("Starting server");
    let app = build_app(None).await;

    // Define the address to run the server on
    let app_port = env::var("APP_PORT").expect("APP_PORT must be set");
    let addr = SocketAddr::from((
        [0, 0, 0, 0],
        app_port.parse().expect("Could not parse app_port"),
    ));
    tracing::info!("Tracing Listening on http://{}", addr);

    axum_server::bind(addr)
        .serve(app.into_make_service())
        .await
        .expect("Could not start axum_server")
}

pub async fn build_app(app_state: Option<AppState>) -> Router {
    tracing::info!("Building application...");
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
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
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
