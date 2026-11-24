use auth::AuthUser;
use axum::Json;
use axum::extract::{Path, Query, State};
use backend_utils::AppError;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::car::create_car_maintenance_event_command::CreateCarMaintenanceEventCommand;
use crate::application::car::delete_car_maintenance_event_command::DeleteCarMaintenanceEventCommand;
use crate::application::car::list_car_maintenance_events_query::ListCarMaintenanceEventsQuery;
use crate::application::car::update_car_maintenance_event_command::UpdateCarMaintenanceEventCommand;
use crate::domain::car::CarId;
use crate::domain::car::car_maintenance_event::CarMaintenanceEventId;
use crate::infrastructure::car::car_maintenance_event_api_types::{
    CreateCarMaintenanceEventCommandDto, GetCarMaintenanceEventsQueryParams,
    UpdateCarMaintenanceEventCommandDto,
};
use crate::infrastructure::car::car_maintenance_event_dto::CarMaintenanceEventDto;
use crate::infrastructure::car::car_maintenance_event_state::CarMaintenanceEventState;
use crate::infrastructure::document::mappers::optional_new_document;

/// Creates a CarMaintenanceEvent for an owned active Car.
///
/// Many events on the same day are allowed. Optional `document_id` must be owned.
/// Optional `new_receipt_document` creates the receipt Document and links it in
/// the same IMMEDIATE transaction as the event INSERT.
///
/// ```text
/// Client        create_car_maintenance_event   Create command        Repository /
///   |           (handler)                           |                DocumentsWriter (SQLite)
///   | POST /car-maintenance-events                  |                       |
///   | { car_id, occurred_on, event_type, ...,       |                       |
///   |   new_receipt_document? }                     |                       |
///   |-------------------->|                         |                       |
///   |                     | new_receipt DTO -> Document (owner = JWT user)  |
///   |                     | (bad storage -> 400)    |                       |
///   |                     |------------------------>|                       |
///   |                     |                         | document_id + new -> 400
///   |                     |                         | load_owned Document (when document_id set)
///   |                     |                         | load_owned Car (else 404)
///   |                     |                         | CarMaintenanceEvent::create (link new id)
///   |                     |                         | no new: save -------->| BEGIN IMMEDIATE
///   |                     |                         | new: writer.create -->|  active-Car check
///   |                     |                         |                       |  [new] INSERT documents + tags
///   |                     |                         |                       |  INSERT event
///   |                     |                         |                       | COMMIT (any error: ROLLBACK)
///   |  201 CarMaintenanceEventDto                   |                       |
///   |<--------------------|<------------------------|<----------------------|
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
    let new_receipt_document = optional_new_document(payload.new_receipt_document, user_id)?;
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
        new_receipt_document,
        use_cases.car_repository.clone(),
        use_cases.car_maintenance_event_repository.clone(),
        use_cases.document_repository.clone(),
        use_cases.car_maintenance_event_documents_writer.clone(),
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
/// Optional `new_receipt_document` creates the receipt Document and links it in
/// the same IMMEDIATE transaction as the event UPDATE.
///
/// ```text
/// Client        update_car_maintenance_event   Update command        Repository /
///   |           (handler)                           |                DocumentsWriter (SQLite)
///   | PUT /car-maintenance-events/{id}              |                       |
///   | { occurred_on, event_type, ...,               |                       |
///   |   new_receipt_document? }                     |                       |
///   |-------------------->|                         |                       |
///   |                     | new_receipt DTO -> Document (owner = JWT user)  |
///   |                     | (bad storage -> 400)    |                       |
///   |                     |------------------------>|                       |
///   |                     |                         | document_id + new -> 400
///   |                     |                         | load_owned Document (when document_id set)
///   |                     |                         | load_owned event (else 404)
///   |                     |                         | event.update (no active-Car check)
///   |                     |                         | no new: update ------>| UPDATE event
///   |                     |                         | new: writer.update -->| BEGIN IMMEDIATE
///   |                     |                         |                       |  INSERT documents + tags
///   |                     |                         |                       |  UPDATE event (0 rows: 404)
///   |                     |                         |                       | COMMIT (any error: ROLLBACK)
///   |  200 CarMaintenanceEventDto                   |                       |
///   |<--------------------|<------------------------|<----------------------|
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
    let new_receipt_document = optional_new_document(payload.new_receipt_document, user_id)?;
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
        new_receipt_document,
        use_cases.car_maintenance_event_repository.clone(),
        use_cases.document_repository.clone(),
        use_cases.car_maintenance_event_documents_writer.clone(),
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
    use crate::application::car::car_maintenance_event_use_cases::CarMaintenanceEventUseCases;
    use crate::application::car::car_repository::CarRepository;
    use crate::domain::car::{Car, CarProfileInput};
    use crate::infrastructure::car::car_collection::CarCollection;
    use crate::infrastructure::car::car_maintenance_event_collection::CarMaintenanceEventCollection;
    use crate::infrastructure::car::car_maintenance_event_documents_collection::CarMaintenanceEventDocumentsCollection;
    use crate::domain::document::document_storage_ref::STORAGE_PROVIDER_PROTON_DRIVE;
    use crate::infrastructure::document::document_api_types::{
        CreateDocumentCommandDto, DocumentStorageRefDto,
    };
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
        documents: Arc<DocumentCollection>,
    }

    fn fixture() -> Fixture {
        let cars = Arc::new(CarCollection::new());
        let events = Arc::new(CarMaintenanceEventCollection::new());
        let documents = Arc::new(DocumentCollection::new());
        let use_cases = Arc::new(CarMaintenanceEventUseCases {
            car_maintenance_event_repository: events.clone(),
            car_repository: cars.clone(),
            document_repository: documents.clone(),
            car_maintenance_event_documents_writer: Arc::new(
                CarMaintenanceEventDocumentsCollection::new(events.clone(), documents.clone()),
            ),
        });
        Fixture {
            use_cases,
            cars,
            events,
            documents,
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
            new_receipt_document: None,
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
            new_receipt_document: None,
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

    fn new_receipt_payload(title: &str) -> CreateDocumentCommandDto {
        CreateDocumentCommandDto {
            title: title.to_string(),
            content: "receipt".to_string(),
            tags: vec![],
            issued_date: None,
            expire_date: None,
            storage: Some(DocumentStorageRefDto {
                provider: STORAGE_PROVIDER_PROTON_DRIVE.to_string(),
                share_id: "share".to_string(),
                node_id: "node".to_string(),
                filename: "receipt.pdf".to_string(),
                mime_type: Some("application/pdf".to_string()),
            }),
        }
    }

    #[tokio::test]
    async fn given_new_receipt_document_when_create_event_then_201_and_receipt_linked() {
        // Given
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let mut payload = create_payload(car.id.0, Utc::now().date_naive());
        payload.new_receipt_document = Some(new_receipt_payload("Oil receipt"));

        // When
        let dto = create_car_maintenance_event(
            auth_user.clone(),
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(payload),
        )
        .await
        .unwrap()
        .data;

        // Then
        let linked = dto.document_id.expect("receipt linked");
        let docs = fx.documents.documents.lock().await;
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].id, linked);
        assert_eq!(docs[0].title, "Oil receipt");
        assert_eq!(docs[0].user_id, auth_user.user_id);
    }

    #[tokio::test]
    async fn given_owned_event_when_update_with_new_receipt_document_then_200_and_receipt_linked() {
        // Given
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
        let mut payload = update_payload(created.occurred_on);
        payload.new_receipt_document = Some(new_receipt_payload("Service receipt"));

        // When
        let dto = update_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
            Json(payload),
        )
        .await
        .unwrap()
        .data;

        // Then
        let linked = dto.document_id.expect("receipt linked");
        let docs = fx.documents.documents.lock().await;
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].id, linked);
    }

    #[tokio::test]
    async fn given_document_id_and_new_receipt_when_create_event_then_validation_and_nothing_stored() {
        // Given
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let mut payload = create_payload(car.id.0, Utc::now().date_naive());
        payload.document_id = Some(Uuid::new_v4());
        payload.new_receipt_document = Some(new_receipt_payload("Receipt"));

        // When
        let result = create_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(payload),
        )
        .await;

        // Then
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(fx.events.events.lock().await.is_empty());
        assert!(fx.documents.documents.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_document_id_and_new_receipt_when_update_event_then_validation_and_nothing_stored() {
        // Given
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
        let mut payload = update_payload(created.occurred_on);
        payload.document_id = Some(Uuid::new_v4());
        payload.new_receipt_document = Some(new_receipt_payload("Receipt"));

        // When
        let result = update_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Path(created.id),
            Json(payload),
        )
        .await;

        // Then
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(fx.documents.documents.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_invalid_storage_in_new_receipt_when_create_event_then_validation_and_nothing_stored() {
        // Given
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, true).await;
        let mut receipt = new_receipt_payload("Receipt");
        if let Some(storage) = receipt.storage.as_mut() {
            storage.node_id = String::new();
        }
        let mut payload = create_payload(car.id.0, Utc::now().date_naive());
        payload.new_receipt_document = Some(receipt);

        // When
        let result = create_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(payload),
        )
        .await;

        // Then
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(fx.events.events.lock().await.is_empty());
        assert!(fx.documents.documents.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_inactive_car_when_create_event_with_new_receipt_then_validation_and_no_document() {
        // Given
        let auth_user = test_auth_user();
        let fx = fixture();
        let car = save_car(&fx.cars, auth_user.user_id, false).await;
        let mut payload = create_payload(car.id.0, Utc::now().date_naive());
        payload.new_receipt_document = Some(new_receipt_payload("Receipt"));

        // When
        let result = create_car_maintenance_event(
            auth_user,
            State(CarMaintenanceEventState(fx.use_cases.clone())),
            Json(payload),
        )
        .await;

        // Then
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(fx.events.events.lock().await.is_empty());
        assert!(fx.documents.documents.lock().await.is_empty());
    }
}
