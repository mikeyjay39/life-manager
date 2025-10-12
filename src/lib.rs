mod application;
mod domain;
pub mod infrastructure;
use crate::{
    application::document_repository::DocumentRepository, domain::document::Document,
    infrastructure::document_orm_collection::DocumentOrmCollection,
};
use axum::{
    Router, http,
    routing::{get, post},
};
use deadpool_diesel::Runtime;
use dotenvy::dotenv;
use infrastructure::{
    app_state::AppState,
    document_handler::{create_document, get_document, upload},
};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::trace::{DefaultMakeSpan, TraceLayer};
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;
pub mod schema;

#[tokio::main]
pub async fn start_server() {
    // Init db
    let pool = create_connection_pool();

    let app = build_app(pool).await;

    // Define the address to run the server on
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("Tracing Listening on http://{}", addr);

    // Run the server
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

pub async fn build_app(pool: deadpool_diesel::postgres::Pool) -> Router {
    // logging

    tracing_subscriber::registry()
        .with(
            fmt::layer()
                // TODO: re-enable JSON logging when Axum and tower-http has been upgraded
                // .event_format(fmt::format().json()) // ✅ replaces `.json()`
                .with_timer(tracing_subscriber::fmt::time::UtcTime::rfc_3339())
                .with_ansi(false), // optional timestamp
        )
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .ok();

    // Build our application with a single route
    let state: AppState<DocumentOrmCollection> = AppState {
        document_repository: Arc::new(tokio::sync::Mutex::new(DocumentOrmCollection::new(pool))),
    };
    create_entity(&state.document_repository).await;

    Router::new()
        .route("/", get(handler))
        .route("/foo", get(|| async { "Hello, Foo!" }))
        .route("/bar", get(|| async { String::from("Hello, Bar!") }))
        .route("/documents", post(create_document))
        .route("/documents/:id", get(get_document))
        .route("/upload", post(upload)) // TODO: Remove this after testing
        .layer(TraceLayer::new_for_http()
                    .make_span_with(DefaultMakeSpan::new().level(Level::INFO).include_headers(true))
            .on_request(|request: &http::Request<_>, _span: &tracing::Span| {
                let trace_id = Uuid::new_v4();
                tracing::info!(%trace_id, method = ?request.method(), uri = ?request.uri(), "request started");
                // You can also attach the trace ID to the span
                _span.record("trace_id", &tracing::field::display(trace_id));
            }),
        )
        .with_state(state)
}

// Define a handler for the route
async fn handler() -> String {
    let document = Document::new(123, "Test", "This is a test document.");
    document.print_details();
    println!("{}", document.content);
    document.content
}

/**
* TODO: Remove this. It is for testing only
*/
pub async fn create_entity(repo: &Arc<Mutex<impl DocumentRepository>>) -> bool {
    let new_document = Document::new(1, "Sample Document", "This is a sample document.");

    let mut repo = repo.lock().await;
    repo.save_document(&new_document).await
}

pub fn create_connection_pool() -> deadpool_diesel::postgres::Pool {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    create_connection_pool_from_url(&database_url)
}

pub fn create_connection_pool_from_url(database_url: &str) -> deadpool_diesel::postgres::Pool {
    let mgr = deadpool_diesel::postgres::Manager::new(database_url.to_string(), Runtime::Tokio1);
    deadpool_diesel::postgres::Pool::builder(mgr)
        .max_size(16)
        .build()
        .expect("Failed to create pool.")
}
