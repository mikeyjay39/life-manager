use async_trait::async_trait;
use chrono::NaiveDate;
use serde::Deserialize;

use crate::domain::document::extraction_media_type::ExtractionMediaType;

/// What the extractor reads: the embedded text of a PDF, or the file itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ExtractionSource {
    Text(String),
    File {
        bytes: Vec<u8>,
        media_type: ExtractionMediaType,
    },
}

/// Fields as the provider returns them, before normalization.
#[derive(Debug, Default, Clone, PartialEq, Deserialize)]
pub struct RawDocumentFields {
    pub title: Option<String>,
    pub content: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub issued_date: Option<String>,
    pub expire_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentExtractionError {
    /// The shared provider quota is used up.
    QuotaExceeded,
    Timeout,
    Provider(String),
    InvalidResponse(String),
}

/// Port to a provider that reads Document form fields from a file or text.
#[async_trait]
pub trait DocumentExtractor: Send + Sync {
    async fn extract(
        &self,
        source: ExtractionSource,
    ) -> Result<RawDocumentFields, DocumentExtractionError>;
}

/// Normalized fields for the Document form. Nothing is stored.
#[derive(Debug, Clone, PartialEq)]
pub struct ExtractedDocumentFields {
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub issued_date: Option<NaiveDate>,
    pub expire_date: Option<NaiveDate>,
}

#[cfg(test)]
pub(crate) mod tests {
    use std::sync::Mutex;

    use super::*;

    /// `DocumentExtractor` that records each source and returns one configured result.
    pub(crate) struct FakeDocumentExtractor {
        result: Result<RawDocumentFields, DocumentExtractionError>,
        received: Mutex<Vec<ExtractionSource>>,
    }

    impl FakeDocumentExtractor {
        pub(crate) fn returning(
            result: Result<RawDocumentFields, DocumentExtractionError>,
        ) -> Self {
            Self {
                result,
                received: Mutex::new(Vec::new()),
            }
        }

        pub(crate) fn received(&self) -> Vec<ExtractionSource> {
            self.received.lock().expect("received lock").clone()
        }
    }

    #[async_trait]
    impl DocumentExtractor for FakeDocumentExtractor {
        async fn extract(
            &self,
            source: ExtractionSource,
        ) -> Result<RawDocumentFields, DocumentExtractionError> {
            self.received.lock().expect("received lock").push(source);
            self.result.clone()
        }
    }
}
