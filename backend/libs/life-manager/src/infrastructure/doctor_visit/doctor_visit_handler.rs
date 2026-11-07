use auth::AuthUser;
use axum::Json;
use axum::extract::{Path, Query, State};
use backend_utils::AppError;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::create_doctor_visit_command::CreateDoctorVisitCommand;
use crate::application::delete_doctor_visit_command::DeleteDoctorVisitCommand;
use crate::application::list_doctor_visits_query::ListDoctorVisitsQuery;
use crate::application::update_doctor_visit_command::UpdateDoctorVisitCommand;
use crate::domain::doctor_visit::DoctorVisitId;
use crate::domain::health_member::HealthMemberId;
use crate::infrastructure::doctor_visit::doctor_visit_api_types::{
    CreateDoctorVisitCommandDto, GetDoctorVisitsQueryParams, UpdateDoctorVisitCommandDto,
};
use crate::infrastructure::doctor_visit::doctor_visit_dto::DoctorVisitDto;
use crate::infrastructure::doctor_visit::doctor_visit_state::DoctorVisitState;

/// Creates a DoctorVisit for an owned active HealthMember.
///
/// Many visits on the same day are allowed.
///
/// ```text
/// +--------+     +---------------------+     +--------------------+     +------------------+
/// |        |     | Handler             |     | Create command     |     | SQLite           |
/// | Client |---->| create_doctor_visit |---->| load member,       |---->| health_members + |
/// |        |     | (JWT user_id)       |     | validate, save     |     | doctor_visits    |
/// +--------+     +---------------------+     +--------------------+     +------------------+
///      |                    |                            |                         |
///      |  POST /doctor-visits                            |                         |
///      |  { health_member_id, visited_on, text fields }  |                         |
///      |------------------->|                            |                         |
///      |                    |  load_owned HealthMember   |                         |
///      |                    |--------------------------->|  (via member repo)      |
///      |                    |  DoctorVisit::create       |                         |
///      |                    |  (active, date, text)      |                         |
///      |                    |  save (tx: active check +  |------------------------>|
///      |                    |       INSERT)              |                         |
///      |  201 DoctorVisitDto                             |                         |
///      |<-------------------|                            |                         |
/// ```
pub async fn create_doctor_visit(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(DoctorVisitState(use_cases)): State<DoctorVisitState>,
    Json(payload): Json<CreateDoctorVisitCommandDto>,
) -> ApiResult<DoctorVisitDto> {
    tracing::info!(
        "Creating DoctorVisit for health_member_id={} visited_on={}",
        payload.health_member_id,
        payload.visited_on
    );
    let health_member_id = HealthMemberId(payload.health_member_id);
    let visited_on = payload.visited_on;
    let text = payload.into_text();
    let visit = CreateDoctorVisitCommand::new(
        user_id,
        health_member_id,
        visited_on,
        text,
        use_cases.health_member_repository.clone(),
        use_cases.doctor_visit_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::created(DoctorVisitDto::from_domain(&visit))
}

/// Lists DoctorVisits for one owned HealthMember, newest first.
pub async fn list_doctor_visits(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(DoctorVisitState(use_cases)): State<DoctorVisitState>,
    Query(params): Query<GetDoctorVisitsQueryParams>,
) -> ApiResult<Vec<DoctorVisitDto>> {
    let health_member_id = params.health_member_id.ok_or_else(|| {
        AppError::Validation("health_member_id query parameter is required".to_string())
    })?;
    let visits = ListDoctorVisitsQuery::new(
        user_id,
        HealthMemberId(health_member_id),
        params.from,
        params.to,
        use_cases.health_member_repository.clone(),
        use_cases.doctor_visit_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(visits.iter().map(DoctorVisitDto::from_domain).collect())
}

/// Returns one owned DoctorVisit. Missing or other user's id → 404.
pub async fn get_doctor_visit(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(DoctorVisitState(use_cases)): State<DoctorVisitState>,
    Path(id): Path<Uuid>,
) -> ApiResult<DoctorVisitDto> {
    let visit = use_cases
        .doctor_visit_repository
        .load_owned(&DoctorVisitId(id), &user_id)
        .await
        .ok_or(AppError::NotFound)?;
    AppResponse::ok(DoctorVisitDto::from_domain(&visit))
}

/// Updates mutable fields on an owned DoctorVisit.
///
/// `health_member_id` is immutable. The owning HealthMember must be active.
/// Missing or other user's id → 404.
///
/// ```text
/// +--------+     +---------------------+     +--------------------+     +------------------+
/// |        |     | Handler             |     | Update command     |     | SQLite           |
/// | Client |---->| update_doctor_visit |---->| load visit+member, |---->| doctor_visits    |
/// |        |     | (JWT user_id)       |     | active check,      |     |                  |
/// +--------+     +---------------------+     | domain update      |     +------------------+
///      |                    |                +--------------------+              |
///      |  PUT /doctor-visits/{id}            |                                    |
///      |  { visited_on, text fields }        |                                    |
///      |------------------->|                |                                    |
///      |                    |  load_owned visit                                   |
///      |                    |  load_owned HealthMember                            |
///      |                    |  ensure_active_for_write                            |
///      |                    |  visit.update                                       |
///      |                    |  repo.update (tx: active check + UPDATE)----------->|
///      |  200 DoctorVisitDto                 |                                    |
///      |<-------------------|                |                                    |
/// ```
pub async fn update_doctor_visit(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(DoctorVisitState(use_cases)): State<DoctorVisitState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateDoctorVisitCommandDto>,
) -> ApiResult<DoctorVisitDto> {
    tracing::info!("Updating DoctorVisit id={}", id);
    let visited_on = payload.visited_on;
    let text = payload.into_text();
    let visit = UpdateDoctorVisitCommand::new(
        DoctorVisitId(id),
        user_id,
        visited_on,
        text,
        use_cases.health_member_repository.clone(),
        use_cases.doctor_visit_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(DoctorVisitDto::from_domain(&visit))
}

/// Hard-deletes an owned DoctorVisit. Missing or other user's id → 404.
pub async fn delete_doctor_visit(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(DoctorVisitState(use_cases)): State<DoctorVisitState>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    tracing::info!("Deleting DoctorVisit id={}", id);
    DeleteDoctorVisitCommand::new(
        DoctorVisitId(id),
        user_id,
        use_cases.doctor_visit_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::<()>::no_content()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::Json;
    use axum::extract::{Path, Query, State};
    use chrono::{NaiveDate, Utc};
    use uuid::Uuid;

    use super::*;
    use crate::application::doctor_visit_use_cases::DoctorVisitUseCases;
    use crate::application::health_member_repository::HealthMemberRepository;
    use crate::domain::health_member::HealthMember;
    use crate::infrastructure::doctor_visit::doctor_visit_collection::DoctorVisitCollection;
    use crate::infrastructure::health_member::health_member_collection::HealthMemberCollection;

    fn test_auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "life-manager".to_string(),
        }
    }

    struct Fixture {
        use_cases: Arc<DoctorVisitUseCases>,
        members: Arc<HealthMemberCollection>,
        visits: Arc<DoctorVisitCollection>,
    }

    fn fixture() -> Fixture {
        let members = Arc::new(HealthMemberCollection::new());
        let visits = Arc::new(DoctorVisitCollection::new());
        let use_cases = Arc::new(DoctorVisitUseCases {
            doctor_visit_repository: visits.clone(),
            health_member_repository: members.clone(),
        });
        Fixture {
            use_cases,
            members,
            visits,
        }
    }

    async fn save_member(
        members: &HealthMemberCollection,
        user_id: Uuid,
        active: bool,
    ) -> HealthMember {
        let mut member = HealthMember::create(user_id, "Alex", None, None).unwrap();
        if !active {
            member.deactivate();
        }
        members.save(member.clone()).await.unwrap();
        member
    }

    fn create_payload(member_id: Uuid, visited_on: NaiveDate) -> CreateDoctorVisitCommandDto {
        CreateDoctorVisitCommandDto {
            health_member_id: member_id,
            visited_on,
            provider_name: Some("Dr. Lee".to_string()),
            reason: Some("Checkup".to_string()),
            notes: None,
        }
    }

    fn update_payload(visited_on: NaiveDate) -> UpdateDoctorVisitCommandDto {
        UpdateDoctorVisitCommandDto {
            visited_on,
            provider_name: Some("Dr. Kim".to_string()),
            reason: None,
            notes: Some("Follow up".to_string()),
        }
    }

    async fn create_visit(
        auth_user: AuthUser,
        fx: &Fixture,
        member_id: Uuid,
        day: NaiveDate,
    ) -> DoctorVisitDto {
        create_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Json(create_payload(member_id, day)),
        )
        .await
        .unwrap()
        .data
    }

    #[tokio::test]
    async fn given_owned_active_member_when_create_visit_then_dto_and_stored() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let today = Utc::now().date_naive();

        let dto = create_visit(auth_user.clone(), &fx, member.id.0, today).await;

        assert_eq!(dto.health_member_id, member.id.0);
        assert_eq!(dto.visited_on, today);
        assert_eq!(dto.provider_name.as_deref(), Some("Dr. Lee"));
        let stored = fx.visits.visits.lock().await;
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].user_id, auth_user.user_id);
    }

    #[tokio::test]
    async fn given_two_visits_same_day_when_create_then_both_stored() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        let a = create_visit(auth_user.clone(), &fx, member.id.0, day).await;
        let b = create_visit(auth_user, &fx, member.id.0, day).await;

        assert_ne!(a.id, b.id);
        assert_eq!(fx.visits.visits.lock().await.len(), 2);
    }

    #[tokio::test]
    async fn given_inactive_member_when_create_visit_then_validation_and_nothing_stored() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, false).await;

        let result = create_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Json(create_payload(member.id.0, Utc::now().date_naive())),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(fx.visits.visits.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_other_users_member_when_create_visit_then_not_found() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, owner.user_id, true).await;

        let result = create_doctor_visit(
            other,
            State(DoctorVisitState(fx.use_cases.clone())),
            Json(create_payload(member.id.0, Utc::now().date_naive())),
        )
        .await;

        assert!(matches!(result, Err(AppError::NotFound)));
        assert!(fx.visits.visits.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_future_date_when_create_visit_then_validation() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);

        let result = create_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Json(create_payload(member.id.0, tomorrow)),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_missing_member_filter_when_list_then_validation() {
        let auth_user = test_auth_user();
        let fx = fixture();

        let result = list_doctor_visits(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Query(GetDoctorVisitsQueryParams {
                health_member_id: None,
                from: None,
                to: None,
            }),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_visits_when_list_with_range_then_newest_first_and_inclusive() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let d3 = NaiveDate::from_ymd_opt(2026, 1, 20).unwrap();
        for day in [d1, d2, d3] {
            create_visit(auth_user.clone(), &fx, member.id.0, day).await;
        }

        let list = list_doctor_visits(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Query(GetDoctorVisitsQueryParams {
                health_member_id: Some(member.id.0),
                from: Some(d1),
                to: Some(d2),
            }),
        )
        .await
        .unwrap()
        .data;

        assert_eq!(list.len(), 2);
        assert_eq!(list[0].visited_on, d2);
        assert_eq!(list[1].visited_on, d1);
    }

    #[tokio::test]
    async fn given_from_after_to_when_list_then_validation() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        let result = list_doctor_visits(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Query(GetDoctorVisitsQueryParams {
                health_member_id: Some(member.id.0),
                from: Some(d2),
                to: Some(d1),
            }),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_owned_visit_when_get_then_dto_and_other_user_not_found() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let created = create_visit(
            auth_user.clone(),
            &fx,
            member.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        let got = get_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await
        .unwrap()
        .data;
        assert_eq!(got, created);

        let other = get_doctor_visit(
            test_auth_user(),
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(other, Err(AppError::NotFound)));
    }

    #[tokio::test]
    async fn given_owned_visit_when_update_then_fields_replaced() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created = create_visit(auth_user.clone(), &fx, member.id.0, day).await;

        let updated = update_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
            Json(update_payload(day)),
        )
        .await
        .unwrap()
        .data;

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.provider_name.as_deref(), Some("Dr. Kim"));
        assert!(updated.reason.is_none());
        assert_eq!(updated.notes.as_deref(), Some("Follow up"));
    }

    #[tokio::test]
    async fn given_member_deactivated_when_update_visit_then_validation_and_unchanged() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created = create_visit(auth_user.clone(), &fx, member.id.0, day).await;
        let mut inactive = member.clone();
        inactive.deactivate();
        fx.members.update(inactive).await.unwrap();

        let result = update_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
            Json(update_payload(day)),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
        let stored = fx.visits.visits.lock().await;
        assert_eq!(stored[0].provider_name.as_deref(), Some("Dr. Lee"));
    }

    #[tokio::test]
    async fn given_other_users_visit_when_update_or_delete_then_not_found() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let created = create_visit(auth_user, &fx, member.id.0, day).await;

        let put = update_doctor_visit(
            test_auth_user(),
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
            Json(update_payload(day)),
        )
        .await;
        assert!(matches!(put, Err(AppError::NotFound)));

        let del = delete_doctor_visit(
            test_auth_user(),
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(del, Err(AppError::NotFound)));
        assert_eq!(fx.visits.visits.lock().await.len(), 1);
    }

    #[tokio::test]
    async fn given_owned_visit_when_delete_twice_then_second_not_found() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let member = save_member(&fx.members, auth_user.user_id, true).await;
        let created = create_visit(
            auth_user.clone(),
            &fx,
            member.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        delete_doctor_visit(
            auth_user.clone(),
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await
        .unwrap();
        assert!(fx.visits.visits.lock().await.is_empty());

        let second = delete_doctor_visit(
            auth_user,
            State(DoctorVisitState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(second, Err(AppError::NotFound)));
    }
}
