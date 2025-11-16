pub trait DocumentSummarizer {
    fn summarize(
        &self,
        text: &str,
    ) -> impl Future<Output = Result<String, Box<dyn std::error::Error>>>;
}
