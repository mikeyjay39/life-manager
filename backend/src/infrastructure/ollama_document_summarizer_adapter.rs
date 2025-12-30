use std::error::Error;

use async_trait::async_trait;
use ollama_rs::{Ollama, generation::completion::request::GenerationRequest};

use crate::domain::document_summarizer::{DocumentSummarizer, DocumentSummaryResult};

// TODO: How does Rust do string constants?
const MODEL_NAME: &str = "llama2";
const SUMMARY_CHAR_MAX_LENGTH: usize = 200;
const TITLE_WORD_LIMIT: usize = 10;

#[derive(Clone)]
pub struct OllamaDocumentSummarizerAdapter {
    // Add any necessary fields here, e.g., API client, configuration, etc.
    ollama_client: Ollama,
}

impl OllamaDocumentSummarizerAdapter {
    pub fn new() -> Self {
        OllamaDocumentSummarizerAdapter {
            // Initialize fields here
            ollama_client: Ollama::default(), // TODO: Make this take envar val instead
        }
    }
}

impl Default for OllamaDocumentSummarizerAdapter {
    fn default() -> Self {
        Self::new()
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
            .collect::<Vec<String>>()
            .into();

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

    // TODO: Mock the Ollama client for testing and add integration tests for this
    #[tokio::test]
    async fn test_summarize() {
        let summarizer = OllamaDocumentSummarizerAdapter::new();
        let text = "Rust is a systems programming language that runs blazingly fast, prevents segfaults, and guarantees thread safety. It is designed to be a safe, concurrent, and practical language that supports functional and imperative-procedural paradigms. Rust is syntactically similar to C++, but it provides better memory safety while maintaining performance.";
        let summary_result = summarizer.summarize(text).await;
        match summary_result {
            Ok(result) => {
                let summary = &result.summary;
                println!("Summary of text: {}", summary);
                let summary_length = summary.chars().count();
                println!("Summary length: {}", summary_length);
                assert!(summary_length < SUMMARY_CHAR_MAX_LENGTH);
            }
            Err(e) => {
                panic!("Summarization failed with error: {}", e);
            }
        }
    }
}
