use auth::AuthUser;
use axum::extract::{Query, State};
use axum::Json;
use backend_utils::AppError;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;

use crate::application::create_health_reading_command::CreateHealthReadingCommand;
use crate::application::list_health_readings_query::ListHealthReadingsQuery;
use crate::domain::health_member::HealthMemberId;
use crate::infrastructure::health::health_reading_api_types::{
    CreateHealthReadingCommandDto, GetHealthReadingsQueryParams,
};
use crate::infrastructure::health::health_reading_dto::HealthReadingDto;
use crate::infrastructure::health::health_reading_state::HealthReadingState;

/// Creates a HealthReading for an owned active HealthMember.
///
/// ```text
/// +--------+     +-----------------------+     +--------------------+     +------------------+
/// |        |     | Handler               |     | Create command     |     | SQLite           |
/// | Client |---->| create_health_reading |---->| load member,       |---->| health_members + |
/// |        |     | (JWT user_id)         |     | validate, save     |     | health_readings  |
/// +--------+     +-----------------------+     +--------------------+     +------------------+
///      |                    |                            |                         |
///      |  POST /health-readings                          |                         |
///      |  { health_member_id, recorded_on, vitals }      |                         |
///      |------------------->|                            |                         |
///      |                    |  load_owned HealthMember   |                         |
///      |                    |--------------------------->|  (via member repo)      |
///      |                    |  find duplicate date       |                         |
///      |                    |  HealthReading::create     |                         |
///      |                    |  save (tx: active check +  |------------------------>|
///      |                    |       INSERT; UNIQUE→400)  |                         |
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::to_bytes;
    use axum::extract::{Query, State};
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use axum::Json;
    use chrono::{NaiveDate, Utc};
    use serde_json::from_slice;
    use uuid::Uuid;

    use super::*;
    use crate::application::health_member_repository::HealthMemberRepository;
    use crate::application::health_member_use_cases::HealthMemberUseCases;
    use crate::application::health_reading_repository::HealthReadingRepository;
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
}
