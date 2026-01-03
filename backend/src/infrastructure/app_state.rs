use std::{env, sync::Arc};

use crate::{
    application::document_use_cases::DocumentUseCases,
    infrastructure::{
        auth::{
            auth_use_cases::AuthUseCases, superuser_only_login_service::SuperuserOnlyLoginService,
        },
        db::{create_connection_pool, run_migrations},
        document::document_orm_collection::DocumentOrmCollection,
        ollama_document_summarizer_adapter::OllamaDocumentSummarizerAdapter,
        reqwest_http_client::ReqwestHttpClient,
        tesseract_adapter::TesseractAdapter,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub document_use_cases: Arc<DocumentUseCases>,
    pub auth_use_cases: Arc<AuthUseCases>,
}

/**
* Builder for AppState
* NOTE: If no DocumentUseCases are provided, default ones will be created using environment
* variables, including the DB connection pool.
*/
pub struct AppStateBuilder {
    document_use_cases: Option<Arc<DocumentUseCases>>,
    auth_use_cases: Option<Arc<AuthUseCases>>,
    db_pool: Option<Arc<deadpool_diesel::postgres::Pool>>,
}

impl AppStateBuilder {
    pub fn new() -> Self {
        Self {
            document_use_cases: None,
            auth_use_cases: None,
            db_pool: None,
        }
    }

    pub fn with_document_use_cases(mut self, document_use_cases: Arc<DocumentUseCases>) -> Self {
        self.document_use_cases = Some(document_use_cases);
        self
    }

    pub fn with_auth_use_cases(mut self, auth_use_cases: Arc<AuthUseCases>) -> Self {
        self.auth_use_cases = Some(auth_use_cases);
        self
    }

    pub fn with_db_pool(mut self, db_pool: Arc<deadpool_diesel::postgres::Pool>) -> Self {
        self.db_pool = Some(db_pool);
        self
    }

    pub async fn build(self) -> AppState {
        let pool = match self.db_pool {
            Some(pool) => pool,
            None => Arc::new(init_db().await),
        };
        AppState {
            document_use_cases: self
                .document_use_cases
                .unwrap_or_else(|| Arc::new(default_document_use_cases(pool))),
            auth_use_cases: self.auth_use_cases.unwrap_or_else(|| {
                Arc::new(AuthUseCases {
                    login_service: Arc::new(SuperuserOnlyLoginService::default()),
                })
            }),
        }
    }
}

fn default_document_use_cases(pool: Arc<deadpool_diesel::postgres::Pool>) -> DocumentUseCases {
    DocumentUseCases {
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
    }
}

impl Default for AppStateBuilder {
    fn default() -> Self {
        Self::new()
    }
}

async fn init_db() -> deadpool_diesel::postgres::Pool {
    let pool = create_connection_pool();
    tracing::info!("Running migrations...");
    run_migrations(&pool).await;
    pool
}
