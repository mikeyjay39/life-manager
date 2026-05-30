use std::error::Error;

use async_trait::async_trait;
use ollama_rs::{Ollama, generation::completion::request::GenerationRequest};
use reqwest::Url;

use crate::domain::document_summarizer::{DocumentSummarizer, DocumentSummaryResult};

const MODEL_NAME: &str = "llama2";
const SUMMARY_CHAR_MAX_LENGTH: usize = 200;
const TITLE_WORD_LIMIT: usize = 10;

/**
* An adapter that uses the Ollama client to summarize documents.
*/
#[derive(Clone)]
pub struct OllamaDocumentSummarizerAdapter {
    ollama_client: Ollama,
}

impl OllamaDocumentSummarizerAdapter {
    pub fn new(url: Option<Url>) -> Self {
        OllamaDocumentSummarizerAdapter {
            ollama_client: match url {
                Some(url) => Ollama::from_url(url),
                None => Ollama::default(),
            },
        }
    }
}

impl Default for OllamaDocumentSummarizerAdapter {
    fn default() -> Self {
        Self::new(None)
    }
}

#[async_trait]
impl DocumentSummarizer for OllamaDocumentSummarizerAdapter {
    async fn summarize(&self, text: &str) -> Result<DocumentSummaryResult, Box<dyn Error>> {
        let prompt = format!(
            "Summarize the following text in a single sentence that is less than {} characters and give it a title that is less than {} words. Please give me the summary first before the title and separate them with a newline character:\n\n{}",
            SUMMARY_CHAR_MAX_LENGTH, TITLE_WORD_LIMIT, text
        );

        let request = GenerationRequest::new(MODEL_NAME.to_string(), prompt);
        let response = self.ollama_client.generate(request).await?;
        let mut result: Vec<String> = response
            .response
            .split('\n')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<String>>();

        Ok(DocumentSummaryResult {
            title: result.swap_remove(1),
            summary: result.swap_remove(0),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::document_summarizer::DocumentSummarizer;
    use tokio;
    use tracing_test::traced_test;

    // NOTE: This test requires an Ollama server running locally with the llama2 model available.
    // It is good for quickly testing prompts but not suitable for unit tests.
    #[tokio::test]
    #[ignore]
    #[traced_test]
    async fn test_summarize() {
        let summarizer = OllamaDocumentSummarizerAdapter::new(None);
        let text = "Rust is a systems programming language that runs blazingly fast, prevents segfaults, and guarantees thread safety. It is designed to be a safe, concurrent, and practical language that supports functional and imperative-procedural paradigms. Rust is syntactically similar to C++, but it provides better memory safety while maintaining performance.";
        let summary_result = summarizer.summarize(text).await;
        match summary_result {
            Ok(result) => {
                let summary = &result.summary;
                tracing::info!("Summary of text: {}", summary);
                let summary_length = summary.chars().count();
                tracing::info!("Summary length: {}", summary_length);
                assert!(summary_length < SUMMARY_CHAR_MAX_LENGTH);
            }
            Err(e) => {
                panic!("Summarization failed with error: {}", e);
            }
        }
    }
}
