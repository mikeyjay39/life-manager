use auth::AuthUser;
use axum::extract::{Path, Query, State};
use axum::Json;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::create_health_member_command::CreateHealthMemberCommand;
use crate::application::deactivate_health_member_command::DeactivateHealthMemberCommand;
use crate::application::list_health_members_query::ListHealthMembersQuery;
use crate::application::update_health_member_command::UpdateHealthMemberCommand;
use crate::domain::health_member::HealthMemberId;
use crate::infrastructure::health_member::health_member_api_types::{
    CreateHealthMemberCommandDto, GetHealthMembersQueryParams, UpdateHealthMemberCommandDto,
};
use crate::infrastructure::health_member::health_member_dto::HealthMemberDto;
use crate::infrastructure::health_member::health_member_state::HealthMemberState;

/// Creates a HealthMember owned by the authenticated user.
///
/// ```text
/// +--------+     +----------------------+     +------------------+
/// |        |     | Handler              |     | SQLite           |
/// | Client |---->| create_health_member |---->| health_members   |
/// |        |     | (JWT user_id)        |     |                  |
/// +--------+     +----------------------+     +------------------+
///      |                    |                          |
///      |  POST /health-members                        |
///      |  { display_name }  |                          |
///      |------------------->|  validate + save         |
///      |                    |------------------------->|
///      |  201 HealthMemberDto                          |
///      |<-------------------|                          |
/// ```
pub async fn create_health_member(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthMemberState(use_cases)): State<HealthMemberState>,
    Json(payload): Json<CreateHealthMemberCommandDto>,
) -> ApiResult<HealthMemberDto> {
    tracing::info!(
        "Creating HealthMember with display_name: {}",
        payload.display_name
    );
    let member = CreateHealthMemberCommand::new(
        user_id,
        payload.display_name,
        payload.birth_date,
        payload.notes,
        use_cases.health_member_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::created(HealthMemberDto::from_domain(&member))
}

pub async fn list_health_members(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthMemberState(use_cases)): State<HealthMemberState>,
    Query(params): Query<GetHealthMembersQueryParams>,
) -> ApiResult<Vec<HealthMemberDto>> {
    let members = ListHealthMembersQuery::new(
        user_id,
        params.include_inactive(),
        use_cases.health_member_repository.clone(),
    )
    .execute()
    .await;
    AppResponse::ok(
        members
            .iter()
            .map(HealthMemberDto::from_domain)
            .collect(),
    )
}

pub async fn get_health_member(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthMemberState(use_cases)): State<HealthMemberState>,
    Path(id): Path<Uuid>,
) -> ApiResult<HealthMemberDto> {
    use_cases
        .health_member_repository
        .load_owned(&HealthMemberId(id), &user_id)
        .await
        .map_or_else(AppResponse::not_found, |member| {
            AppResponse::ok(HealthMemberDto::from_domain(&member))
        })
}

pub async fn update_health_member(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthMemberState(use_cases)): State<HealthMemberState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateHealthMemberCommandDto>,
) -> ApiResult<HealthMemberDto> {
    let member = UpdateHealthMemberCommand::new(
        HealthMemberId(id),
        user_id,
        payload.display_name,
        payload.birth_date,
        payload.notes,
        payload.active,
        use_cases.health_member_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(HealthMemberDto::from_domain(&member))
}

pub async fn deactivate_health_member(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthMemberState(use_cases)): State<HealthMemberState>,
    Path(id): Path<Uuid>,
) -> ApiResult<HealthMemberDto> {
    let member = DeactivateHealthMemberCommand::new(
        HealthMemberId(id),
        user_id,
        use_cases.health_member_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(HealthMemberDto::from_domain(&member))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::to_bytes;
    use axum::extract::{Path, Query, State};
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use axum::Json;
    use chrono::Utc;
    use serde_json::from_slice;
    use uuid::Uuid;

    use super::*;
    use crate::application::health_member_use_cases::HealthMemberUseCases;
    use crate::infrastructure::health_member::health_member_collection::HealthMemberCollection;

    fn test_auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "life-manager".to_string(),
        }
    }

    fn use_cases_with_collection() -> (Arc<HealthMemberUseCases>, Arc<HealthMemberCollection>) {
        let collection = Arc::new(HealthMemberCollection::new());
        let use_cases = Arc::new(HealthMemberUseCases {
            health_member_repository: collection.clone(),
        });
        (use_cases, collection)
    }

    async fn response_json<T: serde::de::DeserializeOwned>(
        response: axum::response::Response,
    ) -> (StatusCode, T) {
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read body");
        let payload = from_slice(&bytes).expect("deserialize body");
        (status, payload)
    }

    #[tokio::test]
    async fn given_valid_jwt_when_create_health_member_then_201_active_owned() {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let payload = CreateHealthMemberCommandDto {
            display_name: "Alex".to_string(),
            birth_date: None,
            notes: None,
        };

        // When
        let response = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(payload),
        )
        .await
        .into_response();

        // Then
        let (status, dto): (StatusCode, HealthMemberDto) = response_json(response).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(dto.display_name, "Alex");
        assert!(dto.active);

        let stored = use_cases
            .health_member_repository
            .load_owned(&HealthMemberId(dto.id), &auth_user.user_id)
            .await
            .expect("owned");
        assert_eq!(stored.user_id, auth_user.user_id);
    }

    #[tokio::test]
    async fn given_owned_member_when_update_display_name_then_200() {
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let created = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;

        let response = update_health_member(
            auth_user,
            State(HealthMemberState(use_cases)),
            Path(created.id),
            Json(UpdateHealthMemberCommandDto {
                display_name: "Alexandra".to_string(),
                birth_date: None,
                notes: None,
                active: None,
            }),
        )
        .await
        .into_response();

        let (status, dto): (StatusCode, HealthMemberDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.display_name, "Alexandra");
    }

    #[tokio::test]
    async fn given_active_member_when_deactivate_then_inactive_and_get_still_works() {
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let created = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;

        let deactivate_response = deactivate_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, HealthMemberDto) =
            response_json(deactivate_response).await;
        assert_eq!(status, StatusCode::OK);
        assert!(!dto.active);

        let get_response = get_health_member(
            auth_user,
            State(HealthMemberState(use_cases)),
            Path(created.id),
        )
        .await
        .into_response();
        let (get_status, get_dto): (StatusCode, HealthMemberDto) =
            response_json(get_response).await;
        assert_eq!(get_status, StatusCode::OK);
        assert!(!get_dto.active);
    }

    #[tokio::test]
    async fn given_active_and_inactive_when_list_default_then_only_active() {
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let active = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Active".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;
        let inactive = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Inactive".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;
        deactivate_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Path(inactive.id),
        )
        .await
        .expect("deactivate");

        let response = list_health_members(
            auth_user,
            State(HealthMemberState(use_cases)),
            Query(GetHealthMembersQueryParams {
                include_inactive: None,
            }),
        )
        .await
        .into_response();
        let (status, list): (StatusCode, Vec<HealthMemberDto>) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, active.id);
    }

    #[tokio::test]
    async fn given_active_and_inactive_when_list_include_inactive_then_both() {
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Active".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create");
        let inactive = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Inactive".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;
        deactivate_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Path(inactive.id),
        )
        .await
        .expect("deactivate");

        let response = list_health_members(
            auth_user,
            State(HealthMemberState(use_cases)),
            Query(GetHealthMembersQueryParams {
                include_inactive: Some(true),
            }),
        )
        .await
        .into_response();
        let (status, list): (StatusCode, Vec<HealthMemberDto>) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list.len(), 2);
    }

    #[tokio::test]
    async fn given_other_users_member_when_update_or_deactivate_then_404() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let created = create_health_member(
            owner,
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;

        let update_result = update_health_member(
            other.clone(),
            State(HealthMemberState(use_cases.clone())),
            Path(created.id),
            Json(UpdateHealthMemberCommandDto {
                display_name: "Hacked".to_string(),
                birth_date: None,
                notes: None,
                active: None,
            }),
        )
        .await;
        assert!(matches!(
            update_result,
            Err(backend_utils::AppError::NotFound)
        ));

        let deactivate_result = deactivate_health_member(
            other,
            State(HealthMemberState(use_cases)),
            Path(created.id),
        )
        .await;
        assert!(matches!(
            deactivate_result,
            Err(backend_utils::AppError::NotFound)
        ));
    }

    #[tokio::test]
    async fn given_future_birth_date_when_create_then_validation_error() {
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);
        let result = create_health_member(
            auth_user,
            State(HealthMemberState(use_cases)),
            Json(CreateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: Some(tomorrow),
                notes: None,
            }),
        )
        .await;
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn given_inactive_when_reactivate_via_put_then_active() {
        let auth_user = test_auth_user();
        let (use_cases, _) = use_cases_with_collection();
        let created = create_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Json(CreateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create")
        .data;
        deactivate_health_member(
            auth_user.clone(),
            State(HealthMemberState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .expect("deactivate");

        let response = update_health_member(
            auth_user,
            State(HealthMemberState(use_cases)),
            Path(created.id),
            Json(UpdateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: None,
                notes: None,
                active: Some(true),
            }),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, HealthMemberDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert!(dto.active);
        assert!(dto.deactivated_at.is_none());
    }
}
