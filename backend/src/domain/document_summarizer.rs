pub trait DocumentSummarizer {
    fn summarize(
        &self,
        text: &str,
    ) -> impl Future<Output = Result<DocumentSummaryResult, Box<dyn std::error::Error>>>;
}

pub struct DocumentSummaryResult {
    pub summary: String,
    pub title: String,
}
