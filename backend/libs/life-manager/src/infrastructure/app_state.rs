use std::{env, sync::Arc};

use auth::{AuthState, AuthStateBuilder};
use deadpool_diesel::sqlite::Pool;

use crate::{
    application::document_use_cases::DocumentUseCases,
    domain::document_text_reader::DocumentTextReader,
    infrastructure::{
        db::{create_connection_pool, create_connection_pool_from_url, run_migrations},
        document::document_orm_collection::DocumentOrmCollection,
        noop_document_text_reader::NoOpDocumentTextReader,
        ollama_document_summarizer_adapter::OllamaDocumentSummarizerAdapter,
        reqwest_http_client::ReqwestHttpClient,
        tesseract_adapter::TesseractAdapter,
    },
};

#[derive(Clone)]
pub struct LifeManagerState {
    pub(crate) document_use_cases: Arc<DocumentUseCases>,
    pub(crate) auth_state: AuthState,
}

#[derive(Clone, Default)]
pub struct LifeManagerDeps {
    pub database_url: Option<String>,
    pub db_pool: Option<Arc<Pool>>,
    pub document_use_cases: Option<Arc<DocumentUseCases>>,
    pub auth_state: Option<AuthState>,
}

impl LifeManagerDeps {
    pub fn from_env() -> Self {
        Self::default()
    }
}

pub struct LifeManagerStateBuilder;

impl LifeManagerStateBuilder {
    pub fn new() -> Self {
        Self
    }

    pub async fn build(self, deps: LifeManagerDeps) -> LifeManagerState {
        tracing::info!("Building LifeManagerState...");
        let pool = match deps.db_pool {
            Some(pool) => pool,
            None => {
                let pool = match deps.database_url {
                    Some(url) => create_connection_pool_from_url(&url),
                    None => create_connection_pool(),
                };
                Arc::new(init_db(pool).await)
            }
        };
        tracing::info!("LifeManagerState DB pool initialized.");
        let auth_state = match deps.auth_state {
            Some(auth_state) => auth_state,
            None => {
                AuthStateBuilder::new()
                    .build("life-manager".to_string(), pool.clone())
                    .await
            }
        };
        LifeManagerState {
            document_use_cases: deps
                .document_use_cases
                .unwrap_or_else(|| Arc::new(default_document_use_cases(pool))),
            auth_state,
        }
    }
}

impl Default for LifeManagerStateBuilder {
    fn default() -> Self {
        Self::new()
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

async fn init_db(pool: Pool) -> Pool {
    tracing::info!("Running life-manager migrations...");
    run_migrations(&pool).await;
    pool
}
