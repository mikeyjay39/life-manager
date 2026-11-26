use auth::AuthUser;
use axum::extract::State;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use chrono::Utc;

use crate::application::document::get_extraction_limits_query::GetExtractionLimitsQuery;
use crate::infrastructure::document::document_extraction_api_types::ExtractionLimitsDto;
use crate::infrastructure::document::document_state::DocumentState;

/// Returns the extraction limits and the units the user has left today (UTC).
/// The limits are read from the database on each request.
///
/// ```text
/// Client -> get_extraction_limits : GET /documents/extract/limits
/// get_extraction_limits -> GetExtractionLimitsQuery : execute(user_id, UTC today)
/// GetExtractionLimitsQuery -> ExtractionLimitsReader : load
///   alt row missing
///     GetExtractionLimitsQuery --> Client : 503 "Extraction is not configured"
/// GetExtractionLimitsQuery -> ExtractionUsage : used_today
/// get_extraction_limits --> Client : 200 ExtractionLimitsDto
/// ```
pub async fn get_extraction_limits(
    AuthUser { user_id, .. }: AuthUser,
    State(DocumentState(document_use_cases)): State<DocumentState>,
) -> ApiResult<ExtractionLimitsDto> {
    let view = GetExtractionLimitsQuery::new(
        document_use_cases.extraction_limits_reader.clone(),
        document_use_cases.extraction_usage.clone(),
        user_id,
        Utc::now().date_naive(),
    )
    .execute()
    .await?;
    AppResponse::ok(ExtractionLimitsDto::from_view(&view))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::to_bytes;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use uuid::Uuid;

    use crate::application::document::document_repository::tests::DocumentCollection;
    use crate::application::document::document_use_cases::DocumentUseCases;
    use crate::domain::document::extraction_limits::ExtractionLimits;
    use crate::domain::document::extraction_limits::tests::{FixedExtractionLimits, SEEDED_LIMITS};
    use crate::domain::document::extraction_usage::tests::InMemoryExtractionUsage;

    use super::*;

    fn state_with_limits(limits: Option<ExtractionLimits>) -> State<DocumentState> {
        State(DocumentState(Arc::new(DocumentUseCases {
            document_repository: Arc::new(DocumentCollection::new()),
            extraction_limits_reader: Arc::new(FixedExtractionLimits(limits)),
            extraction_usage: Arc::new(InMemoryExtractionUsage::new()),
        })))
    }

    fn auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "test-tenant".to_string(),
        }
    }

    async fn body_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read body");
        serde_json::from_slice(&bytes).expect("json body")
    }

    #[tokio::test]
    async fn given_seeded_limits_when_get_then_200_with_values() {
        let response = get_extraction_limits(auth_user(), state_with_limits(Some(SEEDED_LIMITS)))
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::OK);
        let body: ExtractionLimitsDto =
            serde_json::from_value(body_json(response).await).expect("dto");
        assert_eq!(
            body,
            ExtractionLimitsDto {
                daily_limit_per_user: 20,
                remaining_today: 20,
                max_file_bytes: 10_485_760,
                max_pdf_pages: 5,
            }
        );
    }

    #[tokio::test]
    async fn given_missing_limits_row_when_get_then_503() {
        let response = get_extraction_limits(auth_user(), state_with_limits(None))
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(response).await;
        assert_eq!(body["message"], "Extraction is not configured");
    }
}
