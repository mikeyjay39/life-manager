use auth::AuthUser;
use axum::Json;
use axum::extract::{Path, Query, State};
use backend_utils::AppError;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::create_car_maintenance_event_command::CreateCarMaintenanceEventCommand;
use crate::application::delete_car_maintenance_event_command::DeleteCarMaintenanceEventCommand;
use crate::application::list_car_maintenance_events_query::ListCarMaintenanceEventsQuery;
use crate::application::update_car_maintenance_event_command::UpdateCarMaintenanceEventCommand;
use crate::domain::car::CarId;
use crate::domain::car_maintenance_event::CarMaintenanceEventId;
use crate::infrastructure::car_maintenance_event::car_maintenance_event_api_types::{
    CreateCarMaintenanceEventCommandDto, GetCarMaintenanceEventsQueryParams,
    UpdateCarMaintenanceEventCommandDto,
};
use crate::infrastructure::car_maintenance_event::car_maintenance_event_dto::CarMaintenanceEventDto;
use crate::infrastructure::car_maintenance_event::car_maintenance_event_state::CarMaintenanceEventState;

/// Creates a CarMaintenanceEvent for an owned active Car.
///
/// Many events on the same day are allowed. Optional `document_id` must be owned.
///
/// ```text
/// +--------+     +---------------------------+     +--------------------+     +------------------+
/// |        |     | Handler                   |     | Create command     |     | SQLite           |
/// | Client |---->| create_car_maintenance_   |---->| verify document,   |---->| cars +           |
/// |        |     | event (JWT user_id)       |     | load car, validate,|     | car_maintenance_ |
/// +--------+     +---------------------------+     | save               |     | events           |
///      |                    |                      +--------------------+     +------------------+
///      |  POST /car-maintenance-events              |                                  |
///      |  { car_id, occurred_on, event_type, ... }  |                                  |
///      |------------------->|                       |                                  |
///      |                    |  load_owned Document (when document_id set)              |
///      |                    |  load_owned Car                                          |
///      |                    |  CarMaintenanceEvent::create (active, fields)            |
///      |                    |  save (tx: active check + INSERT)----------------------->|
///      |  201 CarMaintenanceEventDto                |                                  |
///      |<-------------------|                       |                                  |
/// ```
pub async fn create_car_maintenance_event(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarMaintenanceEventState(use_cases)): State<CarMaintenanceEventState>,
    Json(payload): Json<CreateCarMaintenanceEventCommandDto>,
) -> ApiResult<CarMaintenanceEventDto> {
    tracing::info!(
        "Creating CarMaintenanceEvent for car_id={} event_type={}",
        payload.car_id,
        payload.event_type
    );
    let event_type = payload.parse_event_type()?;
    let car_id = CarId(payload.car_id);
    let event = CreateCarMaintenanceEventCommand::new(
        user_id,
        car_id,
        payload.occurred_on,
        event_type,
        payload.odometer_miles,
        payload.cost_cents,
        payload.title,
        payload.notes,
        payload.document_id,
        use_cases.car_repository.clone(),
        use_cases.car_maintenance_event_repository.clone(),
        use_cases.document_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::created(CarMaintenanceEventDto::from_domain(&event))
}

/// Lists CarMaintenanceEvents for one owned Car, newest first.
pub async fn list_car_maintenance_events(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarMaintenanceEventState(use_cases)): State<CarMaintenanceEventState>,
    Query(params): Query<GetCarMaintenanceEventsQueryParams>,
) -> ApiResult<Vec<CarMaintenanceEventDto>> {
    let car_id = params.car_id.ok_or_else(|| {
        AppError::Validation("car_id query parameter is required".to_string())
    })?;
    let event_type = params.parse_event_type()?;
    let events = ListCarMaintenanceEventsQuery::new(
        user_id,
        CarId(car_id),
        params.from,
        params.to,
        event_type,
        use_cases.car_repository.clone(),
        use_cases.car_maintenance_event_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(
        events
            .iter()
            .map(CarMaintenanceEventDto::from_domain)
            .collect(),
    )
}

/// Returns one owned CarMaintenanceEvent. Missing or other user's id → 404.
pub async fn get_car_maintenance_event(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarMaintenanceEventState(use_cases)): State<CarMaintenanceEventState>,
    Path(id): Path<Uuid>,
) -> ApiResult<CarMaintenanceEventDto> {
    let event = use_cases
        .car_maintenance_event_repository
        .load_owned(&CarMaintenanceEventId(id), &user_id)
        .await
        .ok_or(AppError::NotFound)?;
    AppResponse::ok(CarMaintenanceEventDto::from_domain(&event))
}

/// Updates an owned CarMaintenanceEvent. `car_id` is immutable.
///
/// Allowed on inactive Cars (history correction). Same field validation as create.
///
/// ```text
/// +--------+     +---------------------------+     +--------------------+     +------------------+
/// |        |     | Handler                   |     | Update command     |     | SQLite           |
/// | Client |---->| update_car_maintenance_   |---->| verify document,   |---->| car_maintenance_ |
/// |        |     | event (JWT user_id)       |     | load_owned, update,|     | events           |
/// +--------+     +---------------------------+     | repo.update        |     +------------------+
///      |                    |                      +--------------------+              |
///      |  PUT /car-maintenance-events/{id}         |                                  |
///      |  { occurred_on, event_type, ... }         |                                  |
///      |------------------->|                       |                                  |
///      |                    |  load_owned Document (when document_id set)              |
///      |                    |  load_owned event                                        |
///      |                    |  event.update (no active-car check)                      |
///      |                    |  repo.update-------------------------------------------->|
///      |  200 CarMaintenanceEventDto                |                                  |
///      |<-------------------|                       |                                  |
/// ```
pub async fn update_car_maintenance_event(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarMaintenanceEventState(use_cases)): State<CarMaintenanceEventState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateCarMaintenanceEventCommandDto>,
) -> ApiResult<CarMaintenanceEventDto> {
    tracing::info!("Updating CarMaintenanceEvent id={}", id);
    let event_type = payload.parse_event_type()?;
    let event = UpdateCarMaintenanceEventCommand::new(
        CarMaintenanceEventId(id),
        user_id,
        payload.occurred_on,
        event_type,
        payload.odometer_miles,
        payload.cost_cents,
        payload.title,
        payload.notes,
        payload.document_id,
        use_cases.car_maintenance_event_repository.clone(),
        use_cases.document_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(CarMaintenanceEventDto::from_domain(&event))
}

/// Hard-deletes an owned CarMaintenanceEvent. Missing or other user's id → 404.
pub async fn delete_car_maintenance_event(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarMaintenanceEventState(use_cases)): State<CarMaintenanceEventState>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    tracing::info!("Deleting CarMaintenanceEvent id={}", id);
    DeleteCarMaintenanceEventCommand::new(
        CarMaintenanceEventId(id),
        user_id,
        use_cases.car_maintenance_event_repository.clone(),
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
    use crate::application::car_maintenance_event_use_cases::CarMaintenanceEventUseCases;
    use crate::application::car_repository::CarRepository;
    use crate::domain::car::{Car, CarProfileInput};
    use crate::infrastructure::car::car_collection::CarCollection;
    use crate::infrastructure::car_maintenance_event::car_maintenance_event_collection::CarMaintenanceEventCollection;
    use crate::infrastructure::document::document_collection::DocumentCollection;

    fn test_auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "life-manager".to_string(),
        }
    }

    struct Fixture {
        use_cases: Arc<CarMaintenanceEventUseCases>,
        cars: Arc<CarCollection>,
        events: Arc<CarMaintenanceEventCollection>,
    }

    fn fixture() -> Fixture {
        let cars = Arc::new(CarCollection::new());
        let events = Arc::new(CarMaintenanceEventCollection::new());
        let documents = Arc::new(DocumentCollection::new());
        let use_cases = Arc::new(CarMaintenanceEventUseCases {
            car_maintenance_event_repository: events.clone(),
            car_repository: cars.clone(),
            document_repository: documents,
        });
        Fixture {
            use_cases,
            cars,
            events,
        }
    }

    async fn save_car(cars: &CarCollection, user_id: Uuid, active: bool) -> Car {
        let mut car = Car::create(
            user_id,
            CarProfileInput {
                display_name: None,
                make: "Toyota",
                model: "Corolla",
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
            },
        )
        .unwrap();
        if !active {
            car.deactivate();
        }
        cars.save(car.clone()).await.unwrap();
        car
    }

    fn create_payload(car_id: Uuid, occurred_on: NaiveDate) -> CreateCarMaintenanceEventCommandDto {
        CreateCarMaintenanceEventCommandDto {
            car_id,
            occurred_on,
            event_type: "oil_change".to_string(),
            odometer_miles: Some(50_000),
            cost_cents: Some(5_999),
            title: None,
            notes: None,
            document_id: None,
        }
    }

    async fn create_event(
        auth_user: AuthUser,
        fx: &Fixture,
        car_id: Uuid,
        day: NaiveDate,
    ) -> CarMaintenanceEventDto {
        create_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(create_payload(car_id, day)),
        )
        .await
        .unwrap()
        .data
    }

    #[tokio::test]
    async fn given_owned_active_car_when_create_event_then_dto_and_stored() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let today = Utc::now().date_naive();

        let dto = create_event(auth_user.clone(), &fx, car.id.0, today).await;

        assert_eq!(dto.car_id, car.id.0);
        assert_eq!(dto.event_type, "oil_change");
        assert_eq!(dto.cost_cents, Some(5_999));
        let stored = fx.events.events.lock().await;
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].user_id, auth_user.user_id);
    }

    #[tokio::test]
    async fn given_inactive_car_when_create_event_then_validation_and_nothing_stored() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, false).await;

        let result = create_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(create_payload(car.id.0, Utc::now().date_naive())),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(fx.events.events.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_other_users_car_when_create_event_then_not_found() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, owner.user_id, true).await;

        let result = create_car_maintenance_event(
            other,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(create_payload(car.id.0, Utc::now().date_naive())),
        )
        .await;

        assert!(matches!(result, Err(AppError::NotFound)));
        assert!(fx.events.events.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_invalid_event_type_when_create_then_validation() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let mut payload = create_payload(car.id.0, Utc::now().date_naive());
        payload.event_type = "bogus".to_string();

        let result = create_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(payload),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_missing_car_filter_when_list_then_validation() {
        let auth_user = test_auth_user();
        let fx = fixture();

        let result = list_car_maintenance_events(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Query(GetCarMaintenanceEventsQueryParams {
                car_id: None,
                from: None,
                to: None,
                event_type: None,
            }),
        )
        .await;

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn given_events_when_list_by_car_then_newest_first_and_filtered() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car1 = save_car(&fx.cars, auth_user.user_id, true).await;
        let car2 = save_car(&fx.cars, auth_user.user_id, true).await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        create_event(auth_user.clone(), &fx, car1.id.0, d1).await;
        create_event(auth_user.clone(), &fx, car1.id.0, d2).await;
        create_event(auth_user.clone(), &fx, car2.id.0, d2).await;

        let list = list_car_maintenance_events(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Query(GetCarMaintenanceEventsQueryParams {
                car_id: Some(car1.id.0),
                from: None,
                to: None,
                event_type: None,
            }),
        )
        .await
        .unwrap()
        .data;

        assert_eq!(list.len(), 2);
        assert_eq!(list[0].occurred_on, d2);
        assert_eq!(list[1].occurred_on, d1);
        assert!(list.iter().all(|e| e.car_id == car1.id.0));
    }

    #[tokio::test]
    async fn given_owned_event_when_get_then_dto_and_other_user_not_found() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let created = create_event(
            auth_user.clone(),
            &fx,
            car.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        let got = get_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await
        .unwrap()
        .data;
        assert_eq!(got, created);

        let other = get_car_maintenance_event(
            test_auth_user(),
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(other, Err(AppError::NotFound)));
    }

    fn update_payload(occurred_on: NaiveDate) -> UpdateCarMaintenanceEventCommandDto {
        UpdateCarMaintenanceEventCommandDto {
            occurred_on,
            event_type: "service".to_string(),
            odometer_miles: Some(60_000),
            cost_cents: Some(7_500),
            title: None,
            notes: None,
            document_id: None,
        }
    }

    #[tokio::test]
    async fn given_owned_event_when_update_odometer_and_cost_then_dto() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let created = create_event(
            auth_user.clone(),
            &fx,
            car.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        let updated = update_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
            Json(update_payload(created.occurred_on)),
        )
        .await
        .unwrap()
        .data;

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.car_id, created.car_id);
        assert_eq!(updated.odometer_miles, Some(60_000));
        assert_eq!(updated.cost_cents, Some(7_500));
        assert_eq!(updated.event_type, "service");
    }

    #[tokio::test]
    async fn given_inactive_car_when_update_event_then_accepted() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let created = create_event(
            auth_user.clone(),
            &fx,
            car.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;
        let mut inactive = fx.cars.get_by_id(&car.id).await.unwrap();
        inactive.deactivate();
        fx.cars.update(inactive).await.unwrap();

        let updated = update_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
            Json(update_payload(created.occurred_on)),
        )
        .await
        .unwrap()
        .data;

        assert_eq!(updated.odometer_miles, Some(60_000));
    }

    #[tokio::test]
    async fn given_other_users_event_when_update_then_not_found() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, owner.user_id, true).await;
        let created = create_event(
            owner,
            &fx,
            car.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        let result = update_car_maintenance_event(
            other,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
            Json(update_payload(created.occurred_on)),
        )
        .await;

        assert!(matches!(result, Err(AppError::NotFound)));
    }

    #[tokio::test]
    async fn given_owned_event_when_delete_then_gone_and_second_delete_not_found() {
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let created = create_event(
            auth_user.clone(),
            &fx,
            car.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        delete_car_maintenance_event(
            auth_user.clone(),
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await
        .unwrap();

        let get = get_car_maintenance_event(
            auth_user.clone(),
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(get, Err(AppError::NotFound)));

        let second = delete_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(second, Err(AppError::NotFound)));
    }

    #[tokio::test]
    async fn given_other_users_event_when_delete_then_not_found() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, owner.user_id, true).await;
        let created = create_event(
            owner,
            &fx,
            car.id.0,
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
        )
        .await;

        let result = delete_car_maintenance_event(
            other,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
        )
        .await;

        assert!(matches!(result, Err(AppError::NotFound)));
        assert_eq!(fx.events.events.lock().await.len(), 1);
    }
}
