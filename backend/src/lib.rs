mod application;
mod domain;
pub mod infrastructure;
use crate::{
    application::document_use_cases::DocumentUseCases,
    domain::document::Document,
    infrastructure::{
        auth::{login_handler::login, test_protected_endpoint_handler::test_protected_endpoint},
        document::{
            document_orm_collection::DocumentOrmCollection, document_router::document_router,
        },
        ollama_document_summarizer_adapter::OllamaDocumentSummarizerAdapter,
        reqwest_http_client::ReqwestHttpClient,
        tesseract_adapter::TesseractAdapter,
    },
};
use axum::{
    Router,
    body::Body,
    http::{Method, Request},
    routing::{get, post},
};
use deadpool_diesel::{Manager, Pool, Runtime};
use diesel::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use dotenvy::dotenv;
use infrastructure::{
    app_state::AppState,
    document::document_handler::{create_document, get_document, upload},
};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};
pub mod schema;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

#[tokio::main]
pub async fn start_server() {
    // Init db
    let pool = create_connection_pool();
    tracing::info!("Running migrations...");
    run_migrations(&pool).await;

    let app = build_app(pool).await;

    // Define the address to run the server on
    let app_port = env::var("APP_PORT").expect("APP_PORT must be set");
    let addr = SocketAddr::from(([0, 0, 0, 0], app_port.parse().unwrap()));
    tracing::info!("Tracing Listening on http://{}", addr);

    // Run the server
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

pub async fn build_app(pool: deadpool_diesel::postgres::Pool) -> Router {
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

    // Build our application with a single route
    let state: AppState = AppState {
        document_use_cases: Arc::new(DocumentUseCases {
            document_repository: (Arc::new(DocumentOrmCollection::new(pool))),
            reader: Arc::new(TesseractAdapter::new(
                env::var("TESSERACT_URL").expect("TESSERACT_URL must be set"),
                Arc::new(ReqwestHttpClient::new()),
            )),
            summarizer: Arc::new(OllamaDocumentSummarizerAdapter::new(
                env::var("OLLAMA_URL")
                    .ok()
                    .and_then(|url_str| url_str.parse().ok()),
            )),
        }),
    };

    Router::new()
        .route("/", get(handler))
        .route("/health", get(|| async { "up" }))
        .route("/login", post(login))
        .route("/foo", get(|| async { "Hello, Foo!" }))
        .route("/bar", get(|| async { String::from("Hello, Bar!") }))
        .route("/protected", get(test_protected_endpoint)) // TODO: Remove this after testing
        .merge(document_router())
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

// Define a handler for the route
async fn handler() -> String {
    let document = Document::new(123, "Test", "This is a test document.");
    document.print_details();
    tracing::info!("{}", document.content);
    document.content
}

pub fn create_connection_pool() -> deadpool_diesel::postgres::Pool {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    tracing::info!("Creating connection pool to database at {}", database_url);
    create_connection_pool_from_url(&database_url)
}

pub fn create_connection_pool_from_url(database_url: &str) -> deadpool_diesel::postgres::Pool {
    let mgr = deadpool_diesel::postgres::Manager::new(database_url.to_string(), Runtime::Tokio1);
    deadpool_diesel::postgres::Pool::builder(mgr)
        .max_size(16)
        .build()
        .expect("Failed to create pool.")
}

/// Run pending migrations
async fn run_migrations(pool: &Pool<Manager<PgConnection>>) -> bool {
    // Get a database connection from the pool
    let conn = pool.get().await.expect("Failed to get DB connection");
    // Run pending migrations on the connection
    let _ = conn
        .interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
}
