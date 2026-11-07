use auth::AuthUser;
use axum::extract::{Path, Query, State};
use axum::Json;
use backend_utils::AppError;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::create_health_reading_command::CreateHealthReadingCommand;
use crate::application::delete_health_reading_command::DeleteHealthReadingCommand;
use crate::application::list_health_readings_query::ListHealthReadingsQuery;
use crate::application::update_health_reading_command::UpdateHealthReadingCommand;
use crate::domain::health_member::HealthMemberId;
use crate::domain::health_reading::HealthReadingId;
use crate::infrastructure::health::health_reading_api_types::{
    CreateHealthReadingCommandDto, GetHealthReadingsQueryParams, UpdateHealthReadingCommandDto,
};
use crate::infrastructure::health::health_reading_dto::HealthReadingDto;
use crate::infrastructure::health::health_reading_state::HealthReadingState;

/// Creates a HealthReading for an owned active HealthMember.
///
/// ```text
/// +--------+     +-----------------------+     +--------------------+     +------------------+
/// |        |     | Handler               |     | Create command     |     | SQLite           |
/// | Client |---->| create_health_reading |---->| load member,       |---->| health_readings  |
/// |        |     | (JWT user_id)         |     | validate, save     |     |                  |
/// +--------+     +-----------------------+     +--------------------+     +------------------+
///      |                    |                            |                         |
///      |  POST /health-readings                          |                         |
///      |  { health_member_id, recorded_on, vitals }      |                         |
///      |------------------->|                            |                         |
///      |                    |  load_owned HealthMember   |                         |
///      |                    |--------------------------->|  (via member repo)      |
///      |                    |  find duplicate date       |                         |
///      |                    |  HealthReading::create     |                         |
///      |                    |  save                      |------------------------>|
///      |  201 HealthReadingDto                           |                         |
///      |<-------------------|                            |                         |
/// ```
pub async fn create_health_reading(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthReadingState(use_cases)): State<HealthReadingState>,
    Json(payload): Json<CreateHealthReadingCommandDto>,
) -> ApiResult<HealthReadingDto> {
    tracing::info!(
        "Creating HealthReading for health_member_id={} recorded_on={}",
        payload.health_member_id,
        payload.recorded_on
    );
    let health_member_id = HealthMemberId(payload.health_member_id);
    let recorded_on = payload.recorded_on;
    let vitals = payload.into_vitals();
    let reading = CreateHealthReadingCommand::new(
        user_id,
        health_member_id,
        recorded_on,
        vitals,
        use_cases.health_member_repository.clone(),
        use_cases.health_reading_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::created(HealthReadingDto::from_domain(&reading))
}

pub async fn list_health_readings(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthReadingState(use_cases)): State<HealthReadingState>,
    Query(params): Query<GetHealthReadingsQueryParams>,
) -> ApiResult<Vec<HealthReadingDto>> {
    let health_member_id = params.health_member_id.ok_or_else(|| {
        AppError::Validation("health_member_id query parameter is required".to_string())
    })?;
    let readings = ListHealthReadingsQuery::new(
        user_id,
        HealthMemberId(health_member_id),
        params.from,
        params.to,
        use_cases.health_member_repository.clone(),
        use_cases.health_reading_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(
        readings
            .iter()
            .map(HealthReadingDto::from_domain)
            .collect(),
    )
}

/// Updates mutable metric fields on an owned HealthReading.
///
/// `health_member_id` is immutable. Missing or other user's id → 404.
///
/// ```text
/// +--------+     +-----------------------+     +--------------------+     +------------------+
/// |        |     | Handler               |     | Update command     |     | SQLite           |
/// | Client |---->| update_health_reading |---->| load_owned,        |---->| health_readings  |
/// |        |     | (JWT user_id)         |     | duplicate check,   |     |                  |
/// +--------+     +-----------------------+     | domain update      |     +------------------+
///      |                    |                 +--------------------+              |
///      |  PUT /health-readings/{id}           |                                   |
///      |  { recorded_on, vitals }             |                                   |
///      |------------------->|                 |                                   |
///      |                    |  load_owned     |                                   |
///      |                    |  find_by_date   |                                   |
///      |                    |  reading.update |                                   |
///      |                    |  repo.update    |---------------------------------->|
///      |  200 HealthReadingDto                |                                   |
///      |<-------------------|                 |                                   |
/// ```
pub async fn update_health_reading(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthReadingState(use_cases)): State<HealthReadingState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateHealthReadingCommandDto>,
) -> ApiResult<HealthReadingDto> {
    tracing::info!("Updating HealthReading id={}", id);
    let recorded_on = payload.recorded_on;
    let vitals = payload.into_vitals();
    let reading = UpdateHealthReadingCommand::new(
        HealthReadingId(id),
        user_id,
        recorded_on,
        vitals,
        use_cases.health_reading_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(HealthReadingDto::from_domain(&reading))
}

/// Hard-deletes an owned HealthReading. Missing or other user's id → 404.
///
/// ```text
/// +--------+     +-----------------------+     +--------------------+     +------------------+
/// |        |     | Handler               |     | Delete command     |     | SQLite           |
/// | Client |---->| delete_health_reading |---->| load_owned, delete |---->| health_readings  |
/// |        |     | (JWT user_id)         |     |                    |     |                  |
/// +--------+     +-----------------------+     +--------------------+     +------------------+
///      |                    |                            |                         |
///      |  DELETE /health-readings/{id}                   |                         |
///      |------------------->|                            |                         |
///      |                    |  load_owned                |                         |
///      |                    |  repo.delete               |------------------------>|
///      |  204               |                            |                         |
///      |<-------------------|                            |                         |
/// ```
pub async fn delete_health_reading(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(HealthReadingState(use_cases)): State<HealthReadingState>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    tracing::info!("Deleting HealthReading id={}", id);
    DeleteHealthReadingCommand::new(
        HealthReadingId(id),
        user_id,
        use_cases.health_reading_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::<()>::no_content()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::to_bytes;
    use axum::extract::{Path, Query, State};
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use axum::Json;
    use chrono::{NaiveDate, Utc};
    use serde_json::from_slice;
    use uuid::Uuid;

    use super::*;
    use crate::application::health_member_repository::HealthMemberRepository;
    use crate::application::health_member_use_cases::HealthMemberUseCases;
    use crate::application::health_reading_use_cases::HealthReadingUseCases;
    use crate::domain::health_member::HealthMember;
    use crate::infrastructure::health::health_reading_collection::HealthReadingCollection;
    use crate::infrastructure::health_member::health_member_api_types::CreateHealthMemberCommandDto;
    use crate::infrastructure::health_member::health_member_collection::HealthMemberCollection;
    use crate::infrastructure::health_member::health_member_handler::create_health_member;
    use crate::infrastructure::health_member::health_member_state::HealthMemberState;

    fn test_auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "life-manager".to_string(),
        }
    }

    fn use_cases_with_collections() -> (
        Arc<HealthReadingUseCases>,
        Arc<HealthMemberCollection>,
        Arc<HealthReadingCollection>,
    ) {
        let members = Arc::new(HealthMemberCollection::new());
        let readings = Arc::new(HealthReadingCollection::new());
        let use_cases = Arc::new(HealthReadingUseCases {
            health_reading_repository: readings.clone(),
            health_member_repository: members.clone(),
        });
        (use_cases, members, readings)
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

    async fn create_owned_member(
        auth_user: AuthUser,
        members: Arc<HealthMemberCollection>,
    ) -> Uuid {
        let member_use_cases = Arc::new(HealthMemberUseCases {
            health_member_repository: members,
        });
        let created = create_health_member(
            auth_user,
            State(HealthMemberState(member_use_cases)),
            Json(CreateHealthMemberCommandDto {
                display_name: "Alex".to_string(),
                birth_date: None,
                notes: None,
            }),
        )
        .await
        .expect("create member")
        .data;
        created.id
    }

    fn metric_payload(health_member_id: Uuid, recorded_on: NaiveDate) -> CreateHealthReadingCommandDto {
        CreateHealthReadingCommandDto {
            health_member_id,
            recorded_on,
            height_cm: Some(180.0),
            weight_kg: Some(75.0),
            systolic_mm_hg: None,
            diastolic_mm_hg: None,
            heart_rate_bpm: None,
            notes: None,
        }
    }

    fn update_payload(recorded_on: NaiveDate, weight_kg: Option<f64>) -> UpdateHealthReadingCommandDto {
        UpdateHealthReadingCommandDto {
            recorded_on,
            height_cm: Some(180.0),
            weight_kg,
            systolic_mm_hg: None,
            diastolic_mm_hg: None,
            heart_rate_bpm: None,
            notes: None,
        }
    }

    async fn create_owned_reading(
        auth_user: AuthUser,
        use_cases: Arc<HealthReadingUseCases>,
        member_id: Uuid,
        recorded_on: NaiveDate,
    ) -> HealthReadingDto {
        let response = create_health_reading(
            auth_user,
            State(HealthReadingState(use_cases)),
            Json(metric_payload(member_id, recorded_on)),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, HealthReadingDto) = response_json(response).await;
        assert_eq!(status, StatusCode::CREATED);
        dto
    }

    #[tokio::test]
    async fn given_owned_active_member_when_create_reading_then_201_with_dto() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let today = Utc::now().date_naive();

        let response = create_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Json(metric_payload(member_id, today)),
        )
        .await
        .into_response();

        let (status, dto): (StatusCode, HealthReadingDto) = response_json(response).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(dto.health_member_id, member_id);
        assert_eq!(dto.recorded_on, today);
        assert!(dto.bmi.is_some());

        let stored = use_cases
            .health_reading_repository
            .load_owned(
                &crate::domain::health_reading::HealthReadingId(dto.id),
                &auth_user.user_id,
            )
            .await
            .expect("owned");
        assert_eq!(stored.user_id, auth_user.user_id);
        assert_eq!(stored.health_member_id.0, member_id);
    }

    #[tokio::test]
    async fn given_inactive_member_when_create_reading_then_400_and_nothing_stored() {
        let auth_user = test_auth_user();
        let (use_cases, members, readings) = use_cases_with_collections();
        let mut member =
            HealthMember::create(auth_user.user_id, "Alex", None, None).unwrap();
        member.deactivate();
        let member_id = member.id.0;
        members.save(member).await.expect("save");

        let result = create_health_reading(
            auth_user,
            State(HealthReadingState(use_cases)),
            Json(metric_payload(member_id, Utc::now().date_naive())),
        )
        .await;
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(readings.readings.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_other_users_member_when_create_reading_then_404_and_nothing_stored() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let (use_cases, members, readings) = use_cases_with_collections();
        let member_id = create_owned_member(owner, members).await;

        let result = create_health_reading(
            other,
            State(HealthReadingState(use_cases)),
            Json(metric_payload(member_id, Utc::now().date_naive())),
        )
        .await;
        assert!(matches!(result, Err(AppError::NotFound)));
        assert!(readings.readings.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_duplicate_date_when_create_then_400_and_existing_unchanged() {
        let auth_user = test_auth_user();
        let (use_cases, members, readings) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        create_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Json(metric_payload(member_id, day)),
        )
        .await
        .expect("first create");

        let first = readings.readings.lock().await[0].clone();

        let result = create_health_reading(
            auth_user,
            State(HealthReadingState(use_cases)),
            Json(CreateHealthReadingCommandDto {
                health_member_id: member_id,
                recorded_on: day,
                height_cm: Some(170.0),
                weight_kg: Some(70.0),
                systolic_mm_hg: None,
                diastolic_mm_hg: None,
                heart_rate_bpm: None,
                notes: None,
            }),
        )
        .await;
        assert!(matches!(result, Err(AppError::Validation(_))));
        let after = readings.readings.lock().await;
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].height_cm, first.height_cm);
        assert_eq!(after[0].weight_kg, first.weight_kg);
    }

    #[tokio::test]
    async fn given_readings_for_two_members_when_list_by_one_then_only_that_member() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let m1 = create_owned_member(auth_user.clone(), members.clone()).await;
        let m2 = create_owned_member(auth_user.clone(), members).await;
        let today = Utc::now().date_naive();
        let yesterday = today - chrono::Duration::days(1);

        create_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Json(metric_payload(m1, today)),
        )
        .await
        .expect("m1");
        create_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Json(metric_payload(m2, yesterday)),
        )
        .await
        .expect("m2");

        let response = list_health_readings(
            auth_user,
            State(HealthReadingState(use_cases)),
            Query(GetHealthReadingsQueryParams {
                health_member_id: Some(m1),
                from: None,
                to: None,
            }),
        )
        .await
        .into_response();

        let (status, list): (StatusCode, Vec<HealthReadingDto>) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].health_member_id, m1);
    }

    #[tokio::test]
    async fn given_several_dates_when_list_with_from_to_then_inclusive_range() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let d3 = NaiveDate::from_ymd_opt(2026, 1, 20).unwrap();

        for day in [d1, d2, d3] {
            create_health_reading(
                auth_user.clone(),
                State(HealthReadingState(use_cases.clone())),
                Json(metric_payload(member_id, day)),
            )
            .await
            .expect("create");
        }

        let response = list_health_readings(
            auth_user,
            State(HealthReadingState(use_cases)),
            Query(GetHealthReadingsQueryParams {
                health_member_id: Some(member_id),
                from: Some(d1),
                to: Some(d2),
            }),
        )
        .await
        .into_response();

        let (status, list): (StatusCode, Vec<HealthReadingDto>) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].recorded_on, d2);
        assert_eq!(list[1].recorded_on, d1);
    }

    #[tokio::test]
    async fn given_from_after_to_when_list_then_400() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let result = list_health_readings(
            auth_user,
            State(HealthReadingState(use_cases)),
            Query(GetHealthReadingsQueryParams {
                health_member_id: Some(member_id),
                from: Some(NaiveDate::from_ymd_opt(2026, 2, 1).unwrap()),
                to: Some(NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()),
            }),
        )
        .await;
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_missing_health_member_id_when_list_then_400() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let result = list_health_readings(
            auth_user,
            State(HealthReadingState(use_cases)),
            Query(GetHealthReadingsQueryParams {
                health_member_id: None,
                from: None,
                to: None,
            }),
        )
        .await;
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_owned_reading_when_update_weight_then_200_and_list_reflects() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created =
            create_owned_reading(auth_user.clone(), use_cases.clone(), member_id, day).await;

        let response = update_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Path(created.id),
            Json(update_payload(day, Some(80.0))),
        )
        .await
        .into_response();

        let (status, dto): (StatusCode, HealthReadingDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.id, created.id);
        assert_eq!(dto.weight_kg, Some(80.0));
        assert_eq!(dto.health_member_id, member_id);

        let list = list_health_readings(
            auth_user,
            State(HealthReadingState(use_cases)),
            Query(GetHealthReadingsQueryParams {
                health_member_id: Some(member_id),
                from: None,
                to: None,
            }),
        )
        .await
        .expect("list")
        .data;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].weight_kg, Some(80.0));
    }

    #[tokio::test]
    async fn given_owned_reading_when_delete_then_204_and_gone_from_list() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created =
            create_owned_reading(auth_user.clone(), use_cases.clone(), member_id, day).await;

        let response = delete_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let list = list_health_readings(
            auth_user,
            State(HealthReadingState(use_cases)),
            Query(GetHealthReadingsQueryParams {
                health_member_id: Some(member_id),
                from: None,
                to: None,
            }),
        )
        .await
        .expect("list")
        .data;
        assert!(list.is_empty());
    }

    #[tokio::test]
    async fn given_other_users_reading_when_update_or_delete_then_404() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(owner.clone(), members).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created = create_owned_reading(owner, use_cases.clone(), member_id, day).await;

        let update_result = update_health_reading(
            other.clone(),
            State(HealthReadingState(use_cases.clone())),
            Path(created.id),
            Json(update_payload(day, Some(80.0))),
        )
        .await;
        assert!(matches!(update_result, Err(AppError::NotFound)));

        let delete_result = delete_health_reading(
            other,
            State(HealthReadingState(use_cases)),
            Path(created.id),
        )
        .await;
        assert!(matches!(delete_result, Err(AppError::NotFound)));
    }

    #[tokio::test]
    async fn given_update_clears_all_metrics_when_put_then_400() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created =
            create_owned_reading(auth_user.clone(), use_cases.clone(), member_id, day).await;

        let result = update_health_reading(
            auth_user,
            State(HealthReadingState(use_cases)),
            Path(created.id),
            Json(UpdateHealthReadingCommandDto {
                recorded_on: day,
                height_cm: None,
                weight_kg: None,
                systolic_mm_hg: None,
                diastolic_mm_hg: None,
                heart_rate_bpm: None,
                notes: None,
            }),
        )
        .await;
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_duplicate_date_when_update_then_400() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let _first =
            create_owned_reading(auth_user.clone(), use_cases.clone(), member_id, d1).await;
        let second =
            create_owned_reading(auth_user.clone(), use_cases.clone(), member_id, d2).await;

        let result = update_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Path(second.id),
            Json(update_payload(d1, Some(80.0))),
        )
        .await;
        assert!(matches!(result, Err(AppError::Validation(_))));

        let stored = use_cases
            .health_reading_repository
            .load_owned(&HealthReadingId(second.id), &auth_user.user_id)
            .await
            .expect("still present");
        assert_eq!(stored.recorded_on, d2);
    }

    #[tokio::test]
    async fn given_deleted_reading_when_delete_again_then_404() {
        let auth_user = test_auth_user();
        let (use_cases, members, _) = use_cases_with_collections();
        let member_id = create_owned_member(auth_user.clone(), members).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created =
            create_owned_reading(auth_user.clone(), use_cases.clone(), member_id, day).await;

        delete_health_reading(
            auth_user.clone(),
            State(HealthReadingState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .expect("first delete");

        let second = delete_health_reading(
            auth_user,
            State(HealthReadingState(use_cases)),
            Path(created.id),
        )
        .await;
        assert!(matches!(second, Err(AppError::NotFound)));
    }
}
