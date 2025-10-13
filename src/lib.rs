mod application;
mod domain;
pub mod infrastructure;
use crate::{
    application::document_repository::DocumentRepository, domain::document::Document,
    infrastructure::document_orm_collection::DocumentOrmCollection,
};
use axum::{
    Router,
    body::Body,
    http::Request,
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
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};
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
    let state: AppState<DocumentOrmCollection> = AppState {
        document_repository: Arc::new(tokio::sync::Mutex::new(DocumentOrmCollection::new(pool))),
    };
    create_entity(&state.document_repository).await;

    Router::new()
        .route("/", get(handler))
        .route("/foo", get(|| async { "Hello, Foo!" }))
        .route("/bar", get(|| async { String::from("Hello, Bar!") }))
        .route("/documents", post(create_document))
        .route("/documents/{id}", get(get_document))
        .route("/upload", post(upload)) // TODO: Remove this after testing
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
