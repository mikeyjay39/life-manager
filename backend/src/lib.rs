mod build_info;
use axum::{
    Router,
    body::Body,
    http::{Method, Request, header},
    routing::get,
};
use life_manager::{LifeManagerState, LifeManagerTenant};
use server_host::{AppBootstrap, TenantMount};
use std::env;
use std::net::SocketAddr;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
pub async fn start_server() {
    tracing::info!("Starting server");
    build_info::init();
    let app = build_app().await;

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

pub async fn build_app() -> Router {
    let bootstrap = AppBootstrap::from_env();
    build_app_with_bootstrap(bootstrap).await
}

/// TODO: This is only used for int tests. Could we remove this and use build_app_with_bootstrap
/// with a test-specific bootstrap instead?
pub async fn build_app_with_life_manager_state(state: LifeManagerState) -> Router {
    let life_manager = LifeManagerTenant::mount_with_state(state);
    build_app_with_tenants(life_manager).await
}

async fn build_app_with_bootstrap(bootstrap: AppBootstrap) -> Router {
    let life_manager = LifeManagerTenant::mount(&bootstrap).await;
    build_app_with_tenants(life_manager).await
}

async fn build_app_with_tenants(life_manager: Router) -> Router {
    tracing::info!("Building application...");

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
        .route("/api/health", get(|| async { "up" }))
        .route("/api/version", get(|| async { build_info::git_commit() }))
        .nest(LifeManagerTenant::MOUNT_PATH, life_manager)
        .layer(
            CorsLayer::new()
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
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
}
