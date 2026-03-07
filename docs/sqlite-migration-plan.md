# Implementation Plan: Switch PostgreSQL to SQLite

## Overview
This plan migrates the backend from PostgreSQL to SQLite, including:
- Changing the primary key from `i32` (serial) to `Uuid` (stored as TEXT)
- Using SQLite with Diesel ORM
- Using temp file SQLite for tests
- Configurable database path via `DATABASE_URL`

---

## Phase 1: Update Dependencies

### 1.1 Modify `backend/Cargo.toml`

**Changes:**
- Change `deadpool-diesel` feature from `postgres` to `sqlite`
- Change `diesel` features from `postgres` to `sqlite`
- Remove `testcontainers-modules` postgres feature (no longer needed for DB)

```toml
# Change these lines:
deadpool-diesel = { version = "0.6", features = ["sqlite"] }
diesel = { version = "2.2.0", features = ["sqlite", "chrono", "uuid", "returning_clauses_for_sqlite_3_35"] }

# In dev-dependencies, remove postgres feature:
testcontainers-modules = { version = "0.13.0", features = [] }  # Or remove entirely if only used for postgres
```

**Note:** The `returning_clauses_for_sqlite_3_35` feature enables `RETURNING` clause support for SQLite 3.35+.

---

## Phase 2: Update Domain Model (UUID Primary Key)

### 2.1 Modify `backend/src/domain/document.rs`

**Changes:**
- Change `id` field from `i32` to `Uuid`
- Update `new()` constructor to generate UUID automatically (remove `id` parameter)
- Add a `with_id()` constructor for cases where ID is known (e.g., loading from DB)
- Update all tests

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Document {
    pub id: Uuid,  // Changed from i32
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub user_id: Uuid,
}

impl Document {
    // New document - generates UUID automatically
    pub fn new(title: &str, content: &str, user_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),  // Generate UUID
            title: title.to_string(),
            content: String::from(content),
            tags: vec![],
            user_id,
        }
    }

    // For loading from database with known ID
    pub fn with_id(id: Uuid, title: &str, content: &str, user_id: Uuid) -> Self {
        Self {
            id,
            title: title.to_string(),
            content: String::from(content),
            tags: vec![],
            user_id,
        }
    }
    
    // ... rest of impl
}
```

**Update `from_file()` method:**
- Change `id: 0` to `id: Uuid::new_v4()`

### 2.2 Modify `backend/src/infrastructure/document/document_dto.rs`

**Changes:**
- Change `id` field from `i32` to `Uuid`
- Update tests

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentDto {
    pub id: Uuid,  // Changed from i32
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
}
```

### 2.3 Modify `backend/src/application/document_repository.rs`

**Changes:**
- Change `get_document` parameter from `i32` to `Uuid`

```rust
#[async_trait]
pub trait DocumentRepository: Sync + Send {
    async fn get_document(&self, id: Uuid) -> Option<Document>;  // Changed from i32
    async fn get_documents(&self, user_id: &Uuid, limit: &u32) -> Vec<Document>;
    async fn get_documents_title_cursor(
        &self,
        user_id: &Uuid,
        limit: &u32,
        title: &str,
    ) -> Vec<Document>;
    async fn save_document(
        &self,
        document: Document,
    ) -> Result<Document, Box<dyn std::error::Error>>;
}
```

---

## Phase 3: Update Database Layer

### 3.1 Create New Migration

**Create directory:** `backend/migrations/YYYYMMDDHHMMSS_sqlite_documents/`

**File: `up.sql`**
```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT NOT NULL
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_title ON documents(title);
```

**File: `down.sql`**
```sql
DROP INDEX IF EXISTS idx_documents_title;
DROP INDEX IF EXISTS idx_documents_user_id;
DROP TABLE documents;
```

### 3.2 Delete or Modify Old Migrations

**Option A (Recommended for fresh start):** Delete the old PostgreSQL migrations:
- Delete `backend/migrations/00000000000000_diesel_initial_setup/` (contains PostgreSQL-specific functions)
- Delete `backend/migrations/2025-08-30-164902_create_documents/`

**Option B:** Keep for history but they won't be used with SQLite.

### 3.3 Update `backend/diesel.toml`

**Changes:**
- Update migrations directory path (if needed)

```toml
[print_schema]
file = "src/schema.rs"
custom_type_derives = ["diesel::query_builder::QueryId", "Clone"]

[migrations_directory]
dir = "migrations"
```

### 3.4 Regenerate Schema - `backend/src/schema.rs`

Run `diesel migration run` after creating the new migration, or manually update:

```rust
diesel::table! {
    documents (id) {
        id -> Text,
        title -> Text,
        content -> Text,
        user_id -> Text,
    }
}
```

### 3.5 Delete `backend/src/infrastructure/schema.rs`

This appears to be a duplicate/old schema file. Remove it and update any imports.

### 3.6 Modify `backend/src/infrastructure/document/document_entity.rs`

**Changes:**
- Change backend check from `diesel::pg::Pg` to `diesel::sqlite::Sqlite`
- Change `id` from `i32` to `String` (UUID stored as TEXT)
- Change `user_id` from `Uuid` to `String`

```rust
use diesel::prelude::*;
use serde::Serialize;

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::documents)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct DocumentEntity {
    pub id: String,      // UUID as TEXT
    pub title: String,
    pub content: String,
    pub user_id: String, // UUID as TEXT
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::documents)]
pub struct NewDocumentEntity {
    pub id: String,      // UUID as TEXT - generated in app layer
    pub title: String,
    pub content: String,
    pub user_id: String, // UUID as TEXT
}
```

### 3.7 Modify `backend/src/infrastructure/db.rs`

**Changes:**
- Switch from `PgConnection` to `SqliteConnection`
- Switch from `deadpool_diesel::postgres` to `deadpool_diesel::sqlite`
- Update pool creation

```rust
use std::env;

use deadpool_diesel::sqlite::{Manager, Pool, Runtime};
use diesel::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use dotenvy::dotenv;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub fn create_connection_pool() -> Pool {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    tracing::info!("Creating connection pool to database at {}", database_url);
    create_connection_pool_from_url(&database_url)
}

pub fn create_connection_pool_from_url(database_url: &str) -> Pool {
    let mgr = Manager::new(database_url.to_string(), Runtime::Tokio1);
    Pool::builder(mgr)
        .max_size(16)
        .build()
        .expect("Failed to create pool.")
}

pub async fn run_migrations(pool: &Pool) -> bool {
    let conn = pool.get().await.expect("Failed to get DB connection");
    let _ = conn
        .interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
}
```

### 3.8 Modify `backend/src/infrastructure/app_state.rs`

**Changes:**
- Update pool type from `deadpool_diesel::postgres::Pool` to `deadpool_diesel::sqlite::Pool`

```rust
// Change import and type references:
use deadpool_diesel::sqlite::Pool;

// In AppStateBuilder:
pub struct AppStateBuilder {
    document_use_cases: Option<Arc<DocumentUseCases>>,
    auth_use_cases: Option<Arc<AuthUseCases>>,
    db_pool: Option<Arc<Pool>>,  // Changed type
}

// Update with_db_pool method:
pub fn with_db_pool(mut self, db_pool: Arc<Pool>) -> Self {
    self.db_pool = Some(db_pool);
    self
}

// Update default_document_use_cases:
fn default_document_use_cases(pool: Arc<Pool>) -> DocumentUseCases {
    // ... same implementation
}

// Update init_db:
async fn init_db() -> Pool {
    let pool = create_connection_pool();
    tracing::info!("Running migrations...");
    run_migrations(&pool).await;
    pool
}
```

### 3.9 Modify `backend/src/infrastructure/document/document_orm_collection.rs`

**Changes:**
- Update pool type from `deadpool_diesel::postgres::Pool` to `deadpool_diesel::sqlite::Pool`
- Update UUID conversion (parse from String, convert to String)
- Update `get_document` to accept `Uuid` instead of `i32`

```rust
use std::error::Error;
use std::sync::Arc;

use crate::application::document_repository::DocumentRepository;
use crate::schema::documents;
use crate::{
    domain::document::Document,
    infrastructure::document::document_entity::{DocumentEntity, NewDocumentEntity},
};
use async_trait::async_trait;
use deadpool_diesel::InteractError;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use uuid::Uuid;

#[derive(Clone)]
pub struct DocumentOrmCollection {
    pub pool: Arc<Pool>,
}

impl DocumentOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        DocumentOrmCollection { pool }
    }
}

#[async_trait]
impl DocumentRepository for DocumentOrmCollection {
    async fn get_document(&self, id: Uuid) -> Option<Document> {
        tracing::info!("Retrieving document with ID: {}", id);
        let conn = self
            .pool
            .get()
            .await
            .expect("Failed to get DB connection from pool");
        
        let id_str = id.to_string();
        let result = conn
            .interact(move |conn| {
                documents::table
                    .filter(documents::id.eq(id_str))
                    .select(DocumentEntity::as_select())
                    .get_result(conn)
            })
            .await;

        match result {
            Ok(r) => match r {
                Ok(entity) => {
                    let doc_id = Uuid::parse_str(&entity.id).ok()?;
                    let user_id = Uuid::parse_str(&entity.user_id).ok()?;
                    Some(Document::with_id(doc_id, &entity.title, &entity.content, user_id))
                }
                Err(_) => None,
            },
            Err(e) => {
                tracing::error!("Error retrieving document: {}", e);
                None
            }
        }
    }

    async fn get_documents(&self, user_id: &Uuid, limit: &u32) -> Vec<Document> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_documents: {}", e);
                return vec![];
            }
        };

        let user_id_str = user_id.to_string();
        let limit = *limit as i64;

        let result = conn
            .interact(move |conn| {
                documents::table
                    .filter(documents::user_id.eq(user_id_str))
                    .limit(limit)
                    .select(DocumentEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(r) => match r {
                Ok(entities) => entities
                    .into_iter()
                    .filter_map(|e| {
                        let doc_id = Uuid::parse_str(&e.id).ok()?;
                        let user_id = Uuid::parse_str(&e.user_id).ok()?;
                        Some(Document::with_id(doc_id, &e.title, &e.content, user_id))
                    })
                    .collect(),
                Err(_) => vec![],
            },
            Err(e) => {
                tracing::error!("Error retrieving documents: {}", e);
                vec![]
            }
        }
    }

    async fn get_documents_title_cursor(
        &self,
        user_id: &Uuid,
        limit: &u32,
        title: &str,
    ) -> Vec<Document> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection: {}", e);
                return vec![];
            }
        };

        let user_id_str = user_id.to_string();
        let limit = *limit as i64;
        let title = title.to_owned();

        let result = conn
            .interact(move |conn| {
                documents::table
                    .filter(documents::user_id.eq(user_id_str))
                    .filter(documents::title.gt(title))
                    .order_by(documents::title.asc())
                    .limit(limit)
                    .select(DocumentEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(r) => match r {
                Ok(entities) => entities
                    .into_iter()
                    .filter_map(|e| {
                        let doc_id = Uuid::parse_str(&e.id).ok()?;
                        let user_id = Uuid::parse_str(&e.user_id).ok()?;
                        Some(Document::with_id(doc_id, &e.title, &e.content, user_id))
                    })
                    .collect(),
                Err(_) => vec![],
            },
            Err(e) => {
                tracing::error!("Error retrieving documents: {}", e);
                vec![]
            }
        }
    }

    async fn save_document(&self, document: Document) -> Result<Document, Box<dyn Error>> {
        let conn = self.pool.get().await?;
        let new_document = NewDocumentEntity {
            id: document.id.to_string(),
            title: document.title.clone(),
            content: document.content.clone(),
            user_id: document.user_id.to_string(),
        };

        let result = conn
            .interact(|conn| {
                diesel::insert_into(documents::table)
                    .values(&new_document)
                    .returning(DocumentEntity::as_returning())
                    .get_result::<DocumentEntity>(conn)
            })
            .await;

        match result {
            Ok(success) => match success {
                Ok(saved_doc) => {
                    tracing::info!("Document saved with ID: {}", saved_doc.id);
                    let doc_id = Uuid::parse_str(&saved_doc.id)?;
                    let user_id = Uuid::parse_str(&saved_doc.user_id)?;
                    Ok(Document::with_id(doc_id, &saved_doc.title, &saved_doc.content, user_id))
                }
                Err(e) => {
                    tracing::error!("Error saving document: {}", e);
                    Err(Box::new(e))
                }
            },
            Err(e) => {
                tracing::error!("Error saving document: {}", e);
                Err(Box::new(e))
            }
        }
    }
}
```

---

## Phase 4: Update Handlers and API

### 4.1 Modify `backend/src/infrastructure/document/document_handler.rs`

**Changes:**
- Update `CreateDocumentCommand` to remove `id` field (UUID generated automatically)
- Update `get_document` path parameter from `u32` to `Uuid`
- Update document creation to use new constructor

```rust
#[derive(Deserialize, Serialize)]
pub struct CreateDocumentCommand {
    // Remove id field - UUID will be generated
    pub title: String,
    pub content: String,
}

// In create_document handler, update the false branch:
false => Some(Document::new(
    &_payload.title,
    &_payload.content,
    user_id,
)),

// Update get_document signature:
pub async fn get_document(
    AuthUser { user_id: _ }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
    Path(id): Path<Uuid>,  // Changed from u32
) -> impl IntoResponse {
    tracing::info!("Fetching document with ID: {}", id);
    let repo = document_use_cases.document_repository.clone();
    match repo.get_document(id).await {  // No longer needs cast
        Some(document) => (StatusCode::OK, Json(json!(document.clone()))),
        None => (StatusCode::NOT_FOUND, Json(json!({}))),
    }
}
```

**Update tests in this file** to use the new constructor without ID parameter.

### 4.2 Modify `backend/src/infrastructure/document/document_collection.rs` (in-memory mock)

**Changes:**
- Update `get_document` to accept `Uuid` instead of `i32`

```rust
async fn get_document(&self, id: Uuid) -> Option<Document> {
    tracing::info!("Retrieving document with ID: {}", id);
    let documents = self.documents.lock().await;
    tracing::info!("Total documents in collection: {}", documents.len());
    documents.iter().find(|doc| doc.id == id).cloned()
}
```

**Update tests** to use new Document constructor.

---

## Phase 5: Update Tests

### 5.1 Modify `backend/tests/common/setup.rs`

**Changes:**
- Update pool types from PostgreSQL to SQLite
- Use temp file for SQLite database
- Remove PostgreSQL-specific imports

```rust
use std::{
    env::{self, set_var},
    sync::Arc,
    thread::sleep,
    time::Duration,
};

use axum_test::{TestServer, TestServerConfig, Transport};
use deadpool_diesel::sqlite::Pool;
use diesel::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use life_manager::infrastructure::{
    app_state::{AppState, AppStateBuilder},
    auth::login_request::{LoginRequest, LoginResponse},
    db::create_connection_pool_from_url,
};
use reqwest::{Client, ClientBuilder};
use serde_json::json;
use tempfile::NamedTempFile;
use wiremock::{Mock, MockServer, ResponseTemplate, matchers::{method, path}};

use crate::common::docker::{docker_compose_down, start_docker_compose_test_profile};

// ... rest of setup with SQLite temp file instead of PostgreSQL docker
```

**Update `run_test_with_test_profile`:**
```rust
pub async fn run_test_with_test_profile<F, Fut>(test: F)
where
    F: FnOnce(TestServer) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    tracing::info!("Starting beforeEach setup");
    
    // Create temp SQLite database file
    let temp_db = NamedTempFile::new().expect("Failed to create temp DB file");
    let db_path = temp_db.path().to_str().unwrap();
    let database_url = format!("sqlite://{}", db_path);
    
    // Start docker compose for Tesseract only
    start_docker_compose_test_profile().await;
    
    let ollama: MockServer = mock_ollama_response().await;
    unsafe {
        set_var("OLLAMA_URL", ollama.uri());
        set_var("DATABASE_URL", &database_url);
    }

    let server = build_app_server(&database_url).await;
    
    // run test
    test(server).await;

    // Cleanup - temp file auto-deleted when temp_db goes out of scope
    docker_compose_down();
}
```

**Update `run_migrations`:**
```rust
async fn run_migrations(pool: &Pool) -> bool {
    let conn = pool.get().await.expect("Failed to get DB connection");
    let _ = conn
        .interact(|conn_inner| conn_inner.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .expect("Failed to run migrations");
    true
}
```

### 5.2 Modify `backend/tests/common/docker.rs`

**Changes:**
- Remove `wait_for_postgres` function
- Update `wait_for_services` to only wait for Tesseract

```rust
async fn wait_for_services() {
    wait_for_tesseract_ready().await;
    // Removed: wait_for_postgres(None);
}
```

---

## Phase 6: Update Configuration Files

### 6.1 Modify `backend/docker-compose.yml`

**Changes:**
- Remove the `postgres` service entirely
- Remove postgres dependency from `life-manager` service
- Keep Tesseract and other services

```yaml
services:
  life-manager:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: life_manager_app
    # Removed: depends_on postgres
    env_file:
      - ${ENV_FILE}
    environment:
      APP_PORT: ${APP_PORT}
    ports:
      - "${APP_PORT}:${APP_PORT}"
    volumes:
      - ./data:/app/data  # Mount for SQLite database persistence
    restart: on-failure
    profiles: ["prod"]

  tesseract:
    image: hertzg/tesseract-server:latest
    container_name: tesseract
    ports:
      - "${TESSERACT_PORT}:${TESSERACT_PORT}"
    environment:
      - TESSERACT_LANGUAGE=eng
    restart: unless-stopped
    profiles: ["test", "dev", "prod"]

volumes:
  ollama:
```

### 6.2 Modify `backend/.test.env`

**Changes:**
- Remove PostgreSQL-related variables
- Update DATABASE_URL to SQLite format

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password

APP_PORT=3000
OLLAMA_PORT=11434
TESSERACT_PORT=8884

DATABASE_URL=sqlite://./data/test.db
TESSERACT_URL=http://localhost:${TESSERACT_PORT}
OLLAMA_URL=http://localhost:${OLLAMA_PORT}
RUST_LOG=debug

JWT_SECRET=test-secret
TLS_CERT_PATH=certs/cert.pem
TLS_KEY_PATH=certs/key.pem
RUST_BACKTRACE=1
```

### 6.3 Create data directory

Create `backend/data/.gitkeep` to ensure the data directory exists but database files are not committed.

### 6.4 Update `backend/.gitignore` (create if doesn't exist)

```gitignore
# SQLite database files
data/*.db
data/*.db-journal
data/*.db-wal
data/*.db-shm
```

---

## Phase 7: Update Documentation

### 7.1 Modify `README.md`

**Changes:**
- Update Diesel installation instructions (SQLite instead of PostgreSQL)
- Update DATABASE_URL examples
- Remove PostgreSQL docker references

```markdown
### Diesel

See this tutorial: https://diesel.rs/guides/getting-started

Install the Diesel command-line interface for SQLite:

```bash
cargo install diesel_cli --no-default-features --features sqlite
```

Set up database and run migrations:

```bash
export DATABASE_URL=sqlite://./data/life-manager.db
diesel migration run
```
```

---

## Phase 8: Verification Steps

### 8.1 Build and Test Sequence

1. **Clean build:**
   ```bash
   cd backend
   cargo clean
   ```

2. **Install SQLite Diesel CLI:**
   ```bash
   cargo install diesel_cli --no-default-features --features sqlite
   ```

3. **Set up database:**
   ```bash
   export DATABASE_URL=sqlite://./data/life-manager.db
   diesel setup
   diesel migration run
   ```

4. **Build project:**
   ```bash
   cargo build
   ```

5. **Run unit tests:**
   ```bash
   cargo test --lib
   ```

6. **Run integration tests:**
   ```bash
   cargo test --test '*'
   ```

### 8.2 Manual Verification

1. Start the application and verify:
   - Database file is created at specified path
   - Migrations run successfully on startup
   - CRUD operations work via API

2. Verify UUID format in responses:
   - Document IDs should be UUID strings like `"550e8400-e29b-41d4-a716-446655440000"`

---

## Summary of Files to Modify

| File | Action |
|------|--------|
| `backend/Cargo.toml` | Modify dependencies |
| `backend/src/domain/document.rs` | Change id type to Uuid, update constructors |
| `backend/src/infrastructure/document/document_dto.rs` | Change id type to Uuid |
| `backend/src/application/document_repository.rs` | Change get_document param to Uuid |
| `backend/src/schema.rs` | Regenerate for SQLite |
| `backend/src/infrastructure/schema.rs` | Delete (duplicate) |
| `backend/src/infrastructure/db.rs` | Switch to SQLite |
| `backend/src/infrastructure/app_state.rs` | Update pool types |
| `backend/src/infrastructure/document/document_entity.rs` | Update for SQLite, String IDs |
| `backend/src/infrastructure/document/document_orm_collection.rs` | Update pool types, UUID conversion |
| `backend/src/infrastructure/document/document_handler.rs` | Update CreateDocumentCommand, path param |
| `backend/src/infrastructure/document/document_collection.rs` | Update get_document signature |
| `backend/tests/common/setup.rs` | Switch to SQLite temp file |
| `backend/tests/common/docker.rs` | Remove PostgreSQL waiting |
| `backend/docker-compose.yml` | Remove postgres service |
| `backend/.test.env` | Update DATABASE_URL |
| `backend/diesel.toml` | Update if needed |
| `backend/migrations/` | Create new SQLite migration, delete old PostgreSQL ones |
| `README.md` | Update documentation |
| `backend/data/.gitkeep` | Create |
| `backend/.gitignore` | Create/update |
