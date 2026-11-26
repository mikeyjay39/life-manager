use std::fmt;
use std::time::Duration;

use async_trait::async_trait;

#[derive(Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

/// A JSON POST. `headers` can hold secrets such as API keys, so adapters must
/// not log them. It has no `Debug` derive for the same reason.
pub struct JsonPostRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: serde_json::Value,
    pub timeout: Duration,
}

#[derive(Debug)]
pub enum HttpClientError {
    Timeout,
    Transport(String),
}

impl fmt::Display for HttpClientError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HttpClientError::Timeout => write!(formatter, "request timed out"),
            HttpClientError::Transport(detail) => write!(formatter, "transport error: {detail}"),
        }
    }
}

impl std::error::Error for HttpClientError {}

/**
 * Port for making HTTP requests.
 */
#[async_trait]
pub trait HttpClient: Send + Sync {
    /// Returns the response for any HTTP status. Only a failure to get a
    /// response is an error.
    async fn post_json(&self, request: JsonPostRequest) -> Result<HttpResponse, HttpClientError>;
}
