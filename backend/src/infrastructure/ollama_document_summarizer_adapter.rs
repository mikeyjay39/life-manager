use std::error::Error;

use ollama_rs::{Ollama, generation::completion::request::GenerationRequest};

use crate::domain::document_summarizer::DocumentSummarizer;

// TODO: How does Rust do string constants?
const MODEL_NAME: &str = "llama2-latest";
const SUMMARY_LENGTH: usize = 200;

pub struct OllamaDocumentSummarizerAdapter {
    // Add any necessary fields here, e.g., API client, configuration, etc.
    ollama_client: Ollama,
}

impl OllamaDocumentSummarizerAdapter {
    pub fn new() -> Self {
        OllamaDocumentSummarizerAdapter {
            // Initialize fields here
            ollama_client: Ollama::default(),
        }
    }
}

impl Default for OllamaDocumentSummarizerAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentSummarizer for OllamaDocumentSummarizerAdapter {
    async fn summarize(&self, text: &str) -> Result<String, Box<dyn Error>> {
        let prompt = format!(
            "Summarize the following text in less than {} characters:\n\n{}",
            SUMMARY_LENGTH, text
        );

        let request = GenerationRequest::new(MODEL_NAME.to_string(), prompt);
        let response = self.ollama_client.generate(request).await?;
        Ok(response.response)
    }
}
