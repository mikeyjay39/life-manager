use async_trait::async_trait;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

use crate::infrastructure::shared::http_client::{
    HttpClient, HttpClientError, HttpResponse, JsonPostRequest,
};

pub struct ReqwestHttpClient {
    client: reqwest::Client,
}

impl ReqwestHttpClient {
    pub fn new() -> Self {
        ReqwestHttpClient {
            client: reqwest::Client::new(),
        }
    }
}

impl Default for ReqwestHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpClient for ReqwestHttpClient {
    async fn post_json(&self, request: JsonPostRequest) -> Result<HttpResponse, HttpClientError> {
        let headers = to_header_map(&request.headers)?;
        let response = self
            .client
            .post(&request.url)
            .headers(headers)
            .json(&request.body)
            .timeout(request.timeout)
            .send()
            .await
            .map_err(to_client_error)?;
        let status = response.status().as_u16();
        let body = response.bytes().await.map_err(to_client_error)?.to_vec();
        Ok(HttpResponse { status, body })
    }
}

/// The error names the bad header, never its value: values can be API keys.
fn to_header_map(headers: &[(String, String)]) -> Result<HeaderMap, HttpClientError> {
    let mut header_map = HeaderMap::new();
    for (name, value) in headers {
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| HttpClientError::Transport(format!("invalid header name {name}")))?;
        let mut header_value = HeaderValue::from_str(value)
            .map_err(|_| HttpClientError::Transport(format!("invalid value for header {name}")))?;
        header_value.set_sensitive(true);
        header_map.insert(header_name, header_value);
    }
    Ok(header_map)
}

// reqwest error text holds the URL and the cause, not the request headers.
fn to_client_error(error: reqwest::Error) -> HttpClientError {
    if error.is_timeout() {
        return HttpClientError::Timeout;
    }
    HttpClientError::Transport(error.to_string())
}
