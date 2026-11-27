use async_trait::async_trait;

/// Owner-set limits for document field extraction. The values come from the
/// single `document_extraction_limits` row.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExtractionLimits {
    pub daily_limit_per_user: u32,
    pub max_file_bytes: u64,
    pub max_pdf_pages: u32,
}

#[async_trait]
pub trait ExtractionLimitsReader: Send + Sync {
    /// Returns `Ok(None)` when the limits row is missing.
    async fn load(&self) -> anyhow::Result<Option<ExtractionLimits>>;
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// `ExtractionLimitsReader` that always returns the same value.
    pub(crate) struct FixedExtractionLimits(pub Option<ExtractionLimits>);

    #[async_trait]
    impl ExtractionLimitsReader for FixedExtractionLimits {
        async fn load(&self) -> anyhow::Result<Option<ExtractionLimits>> {
            Ok(self.0)
        }
    }

    pub(crate) const SEEDED_LIMITS: ExtractionLimits = ExtractionLimits {
        daily_limit_per_user: 20,
        max_file_bytes: 10_485_760,
        max_pdf_pages: 5,
    };
}
