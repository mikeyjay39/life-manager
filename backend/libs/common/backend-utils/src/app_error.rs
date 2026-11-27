use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Resource not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),
    #[error("Payload too large: {0}")]
    PayloadTooLarge(String),
    #[error("Too many requests: {0}")]
    TooManyRequests(String),
    #[error("Bad gateway: {0}")]
    BadGateway(String),
    #[error("Gateway timeout: {0}")]
    GatewayTimeout(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "not_found", self.to_string()),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, "validation_error", msg),
            AppError::Internal(_) => {
                tracing::error!("Internal server error: {:?}", self);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "An internal error occurred".to_string(),
                )
            }
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", self.to_string()),
            AppError::ServiceUnavailable(msg) => {
                (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable", msg)
            }
            AppError::PayloadTooLarge(msg) => {
                (StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large", msg)
            }
            AppError::TooManyRequests(msg) => {
                (StatusCode::TOO_MANY_REQUESTS, "too_many_requests", msg)
            }
            AppError::BadGateway(msg) => (StatusCode::BAD_GATEWAY, "bad_gateway", msg),
            AppError::GatewayTimeout(msg) => (StatusCode::GATEWAY_TIMEOUT, "gateway_timeout", msg),
        };
        let body = ErrorResponse {
            error: error_type.to_string(),
            message,
        };
        (status, Json(body)).into_response()
    }
}

impl From<Box<dyn std::error::Error>> for AppError {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        AppError::Internal(anyhow::Error::msg(err.to_string()))
    }
}

impl AppError {
    pub fn internal_err_from_msg(msg: &str) -> Self {
        AppError::Internal(anyhow::Error::msg(msg.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use axum::response::IntoResponse;
    use serde_json::Value;

    use super::*;

    /**
     * Helper function to extract JSON from an axum Response for testing purposes.
     */
    async fn response_json(response: Response) -> Value {
        let body = response.into_body();
        let bytes = to_bytes(body, usize::MAX)
            .await
            .expect("failed to read response body");
        serde_json::from_slice(&bytes).expect("response body should be JSON")
    }

    #[tokio::test]
    async fn given_not_found_when_into_response_then_returns_404_json() {
        let response = AppError::NotFound.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let json = response_json(response).await;
        assert_eq!(json["error"], "not_found");
        assert_eq!(json["message"], "Resource not found");
    }

    #[tokio::test]
    async fn given_validation_error_when_into_response_then_returns_400_json() {
        let response = AppError::Validation("bad input".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let json = response_json(response).await;
        assert_eq!(json["error"], "validation_error");
        assert_eq!(json["message"], "bad input");
    }

    #[tokio::test]
    async fn given_unauthorized_when_into_response_then_returns_401_json() {
        let response = AppError::Unauthorized.into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let json = response_json(response).await;
        assert_eq!(json["error"], "unauthorized");
        assert_eq!(json["message"], "Unauthorized");
    }

    #[tokio::test]
    async fn given_internal_error_when_into_response_then_returns_500_without_leaking_details() {
        let response =
            AppError::Internal(anyhow::anyhow!("database connection failed")).into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let json = response_json(response).await;
        assert_eq!(json["error"], "internal_error");
        assert_eq!(json["message"], "An internal error occurred");
        assert!(
            !json["message"].as_str().unwrap().contains("database"),
            "internal error message must not leak underlying details"
        );
    }

    #[test]
    fn given_box_error_when_from_then_produces_internal_variant() {
        let err: Box<dyn std::error::Error> = Box::new(std::io::Error::other("save failed"));
        assert!(matches!(AppError::from(err), AppError::Internal(_)));
    }

    #[test]
    fn given_message_when_internal_err_from_msg_then_produces_internal_variant() {
        assert!(matches!(
            AppError::internal_err_from_msg("handler failed"),
            AppError::Internal(_)
        ));
    }

    #[tokio::test]
    async fn given_service_unavailable_when_into_response_then_returns_503_json() {
        let response = AppError::ServiceUnavailable("try again later".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        let json = response_json(response).await;
        assert_eq!(json["error"], "service_unavailable");
        assert_eq!(json["message"], "try again later");
    }

    #[tokio::test]
    async fn given_payload_too_large_when_into_response_then_returns_413_json() {
        let response = AppError::PayloadTooLarge("details".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);

        let json = response_json(response).await;
        assert_eq!(json["error"], "payload_too_large");
        assert_eq!(json["message"], "details");
    }

    #[tokio::test]
    async fn given_too_many_requests_when_into_response_then_returns_429_json() {
        let response = AppError::TooManyRequests("details".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        let json = response_json(response).await;
        assert_eq!(json["error"], "too_many_requests");
        assert_eq!(json["message"], "details");
    }

    #[tokio::test]
    async fn given_bad_gateway_when_into_response_then_returns_502_json() {
        let response = AppError::BadGateway("details".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);

        let json = response_json(response).await;
        assert_eq!(json["error"], "bad_gateway");
        assert_eq!(json["message"], "details");
    }

    #[tokio::test]
    async fn given_gateway_timeout_when_into_response_then_returns_504_json() {
        let response = AppError::GatewayTimeout("details".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);

        let json = response_json(response).await;
        assert_eq!(json["error"], "gateway_timeout");
        assert_eq!(json["message"], "details");
    }
}
