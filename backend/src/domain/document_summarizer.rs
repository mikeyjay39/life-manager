use async_trait::async_trait;

#[async_trait]
pub trait DocumentSummarizer: Sync + Send {
    async fn summarize(
        &self,
        text: &str,
    ) -> Result<DocumentSummaryResult, Box<dyn std::error::Error>>;
}

pub struct DocumentSummaryResult {
    pub summary: String,
    pub title: String,
}
