mod application;
mod domain;
mod infrastructure;
use crate::{
    domain::document::Document, infrastructure::document_orm_collection::DocumentOrmCollection,
};
use application::application::DocumentRepository;
use axum::{
    Router,
    routing::{get, post},
};
use deadpool_diesel::Runtime;
use diesel::prelude::*;
use dotenvy::dotenv;
use infrastructure::{
    app_state::AppState,
    document_entity,
    document_handler::{create_document, get_document, upload},
};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;
pub mod schema;

#[tokio::main]
pub async fn start_server() {
    // Init db
    let mut conn = establish_connection();
    let pool = create_connection_pool();
    // Build our application with a single route
    let state: AppState<DocumentOrmCollection> = AppState {
        document_repository: Arc::new(tokio::sync::Mutex::new(DocumentOrmCollection::new(pool))),
    };
    create_entity(&state.document_repository).await;
    let app = Router::new()
        .route("/", get(handler))
        .route("/foo", get(|| async { "Hello, Foo!" }))
        .route("/bar", get(|| async { String::from("Hello, Bar!") }))
        .route("/documents", post(create_document))
        .route("/documents/:id", get(get_document))
        .route("/upload", post(upload)) // TODO: Remove this after testing
        .with_state(state);

    // Define the address to run the server on
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Listening on http://{}", addr);

    // Run the server
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

// Define a handler for the route
async fn handler() -> String {
    let document = Document::new(123, "Test", "This is a test document.");
    document.print_details();
    println!("{}", document.content);
    document.content
}

pub fn establish_connection() -> PgConnection {
    dotenv().ok();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}

pub async fn create_entity(repo: &Arc<Mutex<impl DocumentRepository>>) -> bool {
    let new_document = Document::new(1, "Sample Document", "This is a sample document.");

    let mut repo = repo.lock().await;
    repo.save_document(&new_document).await
}

pub fn create_connection_pool() -> deadpool_diesel::postgres::Pool {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let mgr = deadpool_diesel::postgres::Manager::new(database_url, Runtime::Tokio1);
    deadpool_diesel::postgres::Pool::builder(mgr)
        .max_size(16)
        .build()
        .expect("Failed to create pool.")
}
