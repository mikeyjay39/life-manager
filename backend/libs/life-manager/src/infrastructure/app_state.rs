use std::{env, sync::Arc};

use auth::{AuthState, AuthStateBuilder};
use deadpool_diesel::sqlite::Pool;

use crate::{
    application::document_use_cases::DocumentUseCases,
    domain::document_text_reader::DocumentTextReader,
    infrastructure::{
        db::{create_connection_pool, run_migrations},
        document::document_orm_collection::DocumentOrmCollection,
        noop_document_text_reader::NoOpDocumentTextReader,
        ollama_document_summarizer_adapter::OllamaDocumentSummarizerAdapter,
        reqwest_http_client::ReqwestHttpClient,
        tesseract_adapter::TesseractAdapter,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub document_use_cases: Arc<DocumentUseCases>,
    pub auth_state: AuthState,
}

/// Builder for AppState
/// NOTE: If no DocumentUseCases are provided, default ones will be created using environment
/// variables, including the DB connection pool.
pub struct AppStateBuilder {
    document_use_cases: Option<Arc<DocumentUseCases>>,
    auth_state: Option<AuthState>,
    db_pool: Option<Arc<Pool>>,
}

impl AppStateBuilder {
    pub fn new() -> Self {
        Self {
            document_use_cases: None,
            auth_state: None,
            db_pool: None,
        }
    }

    pub fn with_document_use_cases(mut self, document_use_cases: Arc<DocumentUseCases>) -> Self {
        self.document_use_cases = Some(document_use_cases);
        self
    }

    pub fn with_auth_state(mut self, auth_state: AuthState) -> Self {
        self.auth_state = Some(auth_state);
        self
    }

    pub fn with_db_pool(mut self, db_pool: Arc<Pool>) -> Self {
        self.db_pool = Some(db_pool);
        self
    }

    pub async fn build(self) -> AppState {
        tracing::info!("Building AppState...");
        let pool = match self.db_pool {
            Some(pool) => pool,
            None => Arc::new(init_db().await),
        };
        tracing::info!("AppState DB pool initialized.");
        AppState {
            document_use_cases: self
                .document_use_cases
                .unwrap_or_else(|| Arc::new(default_document_use_cases(pool))),
            auth_state: self
                .auth_state
                .unwrap_or_else(|| AuthStateBuilder::new().build("life-manager".to_string())),
        }
    }
}

fn tesseract_enabled_from_env() -> bool {
    env::var("TESSERACT_ENABLED")
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

fn default_document_use_cases(pool: Arc<Pool>) -> DocumentUseCases {
    tracing::info!("Creating default DocumentUseCases...");
    let reader: Arc<dyn DocumentTextReader> = if tesseract_enabled_from_env() {
        Arc::new(TesseractAdapter::new(
            env::var("TESSERACT_URL")
                .expect("TESSERACT_URL must be set when TESSERACT_ENABLED is true"),
            Arc::new(ReqwestHttpClient::new()),
        ))
    } else {
        Arc::new(NoOpDocumentTextReader::new())
    };
    DocumentUseCases {
        document_repository: (Arc::new(DocumentOrmCollection::new(pool))),
        reader,
        summarizer: Arc::new(OllamaDocumentSummarizerAdapter::new(
            env::var("OLLAMA_URL")
                .ok()
                .and_then(|url_str| url_str.parse().ok()),
        )),
    }
}

impl Default for AppStateBuilder {
    fn default() -> Self {
        Self::new()
    }
}

async fn init_db() -> Pool {
    let pool = create_connection_pool();
    tracing::info!("Running migrations...");
    run_migrations(&pool).await;
    pool
}
