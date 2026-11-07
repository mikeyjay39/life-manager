use std::{env, sync::Arc};

use anyhow::Context;
use auth::{AuthState, AuthStateBuilder};
use deadpool_diesel::sqlite::Pool;

use crate::{
    application::{
        car_use_cases::CarUseCases, doctor_visit_use_cases::DoctorVisitUseCases,
        document_use_cases::DocumentUseCases, health_member_use_cases::HealthMemberUseCases,
        health_reading_use_cases::HealthReadingUseCases,
    },
    domain::document_text_reader::DocumentTextReader,
    infrastructure::{
        car::car_orm_collection::CarOrmCollection,
        db::{create_connection_pool, create_connection_pool_from_url, run_migrations},
        doctor_visit::doctor_visit_orm_collection::DoctorVisitOrmCollection,
        document::document_orm_collection::DocumentOrmCollection,
        health::health_reading_orm_collection::HealthReadingOrmCollection,
        health_member::health_member_orm_collection::HealthMemberOrmCollection,
        noop_document_text_reader::NoOpDocumentTextReader,
        ollama_document_summarizer_adapter::OllamaDocumentSummarizerAdapter,
        reqwest_http_client::ReqwestHttpClient,
        tesseract_adapter::TesseractAdapter,
    },
};

#[derive(Clone)]
pub struct LifeManagerState {
    pub(crate) document_use_cases: Arc<DocumentUseCases>,
    pub(crate) health_member_use_cases: Arc<HealthMemberUseCases>,
    pub(crate) health_reading_use_cases: Arc<HealthReadingUseCases>,
    pub(crate) doctor_visit_use_cases: Arc<DoctorVisitUseCases>,
    pub(crate) car_use_cases: Arc<CarUseCases>,
    pub(crate) auth_state: AuthState,
}

#[derive(Clone, Default)]
pub struct LifeManagerDeps {
    pub database_url: Option<String>,
    pub db_pool: Option<Arc<Pool>>,
    pub document_use_cases: Option<Arc<DocumentUseCases>>,
    pub health_member_use_cases: Option<Arc<HealthMemberUseCases>>,
    pub health_reading_use_cases: Option<Arc<HealthReadingUseCases>>,
    pub doctor_visit_use_cases: Option<Arc<DoctorVisitUseCases>>,
    pub car_use_cases: Option<Arc<CarUseCases>>,
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

    pub async fn build(self, deps: LifeManagerDeps) -> anyhow::Result<LifeManagerState> {
        tracing::info!("Building LifeManagerState...");
        let pool = match deps.db_pool {
            Some(pool) => pool,
            None => {
                let pool = match deps.database_url {
                    Some(url) => create_connection_pool_from_url(&url)?,
                    None => create_connection_pool()?,
                };
                Arc::new(init_db(pool).await?)
            }
        };
        tracing::info!("LifeManagerState DB pool initialized.");
        let auth_state = match deps.auth_state {
            Some(auth_state) => auth_state,
            None => {
                AuthStateBuilder::new()
                    .build("life-manager".to_string(), pool.clone())
                    .await?
            }
        };
        let document_use_cases = match deps.document_use_cases {
            Some(use_cases) => use_cases,
            None => Arc::new(default_document_use_cases(pool.clone())?),
        };
        let health_member_use_cases = match deps.health_member_use_cases {
            Some(use_cases) => use_cases,
            None => Arc::new(HealthMemberUseCases {
                health_member_repository: Arc::new(HealthMemberOrmCollection::new(pool.clone())),
            }),
        };
        let health_reading_use_cases = match deps.health_reading_use_cases {
            Some(use_cases) => use_cases,
            None => Arc::new(HealthReadingUseCases {
                health_reading_repository: Arc::new(HealthReadingOrmCollection::new(pool.clone())),
                health_member_repository: health_member_use_cases
                    .health_member_repository
                    .clone(),
            }),
        };
        let doctor_visit_use_cases = match deps.doctor_visit_use_cases {
            Some(use_cases) => use_cases,
            None => Arc::new(DoctorVisitUseCases {
                doctor_visit_repository: Arc::new(DoctorVisitOrmCollection::new(pool.clone())),
                health_member_repository: health_member_use_cases
                    .health_member_repository
                    .clone(),
            }),
        };
        let car_use_cases = match deps.car_use_cases {
            Some(use_cases) => use_cases,
            None => Arc::new(CarUseCases {
                car_repository: Arc::new(CarOrmCollection::new(pool)),
                document_repository: document_use_cases.document_repository.clone(),
            }),
        };
        Ok(LifeManagerState {
            document_use_cases,
            health_member_use_cases,
            health_reading_use_cases,
            doctor_visit_use_cases,
            car_use_cases,
            auth_state,
        })
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

fn default_document_use_cases(pool: Arc<Pool>) -> anyhow::Result<DocumentUseCases> {
    tracing::info!("Creating default DocumentUseCases...");
    let reader: Arc<dyn DocumentTextReader> = if tesseract_enabled_from_env() {
        let tesseract_url = env::var("TESSERACT_URL")
            .context("TESSERACT_URL must be set when TESSERACT_ENABLED is true")?;
        Arc::new(TesseractAdapter::new(
            tesseract_url,
            Arc::new(ReqwestHttpClient::new()),
        ))
    } else {
        Arc::new(NoOpDocumentTextReader::new())
    };
    Ok(DocumentUseCases {
        document_repository: (Arc::new(DocumentOrmCollection::new(pool))),
        reader,
        summarizer: Arc::new(OllamaDocumentSummarizerAdapter::new(
            env::var("OLLAMA_URL")
                .ok()
                .and_then(|url_str| url_str.parse().ok()),
        )),
    })
}

async fn init_db(pool: Pool) -> anyhow::Result<Pool> {
    tracing::info!("Running life-manager migrations...");
    run_migrations(&pool).await?;
    Ok(pool)
}
