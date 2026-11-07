use auth::AuthUser;
use axum::extract::{Path, Query, State};
use axum::Json;
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::create_car_command::CreateCarCommand;
use crate::application::deactivate_car_command::DeactivateCarCommand;
use crate::application::delete_car_command::DeleteCarCommand;
use crate::application::list_cars_query::ListCarsQuery;
use crate::application::update_car_command::UpdateCarCommand;
use crate::domain::car::CarId;
use crate::infrastructure::car::car_api_types::{
    CreateCarCommandDto, GetCarsQueryParams, UpdateCarCommandDto,
};
use crate::infrastructure::car::car_dto::CarDto;
use crate::infrastructure::car::car_state::CarState;

/// Creates a Car owned by the authenticated user.
///
/// ```text
/// +--------+     +---------------+     +------------------+     +--------+
/// |        |     | Handler       |     | Create command   |     | SQLite |
/// | Client |---->| create_car    |---->| validate profile |---->| cars   |
/// |        |     | (JWT user_id) |     | + doc ownership  |     |        |
/// +--------+     +---------------+     +------------------+     +--------+
///      |                  |                      |                    |
///      |  POST /cars                            |                    |
///      |  { make, model, year, ... }             |                    |
///      |----------------->|                      |                    |
///      |                  |  verify Document ids |                    |
///      |                  |  (owned UUID refs)   |                    |
///      |                  |  unique VIN/plate    |                    |
///      |                  |  save                |------------------->|
///      |  201 CarDto      |                      |                    |
///      |<-----------------|                      |                    |
/// ```
pub async fn create_car(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Json(payload): Json<CreateCarCommandDto>,
) -> ApiResult<CarDto> {
    tracing::info!(
        "Creating Car make={} model={} year={}",
        payload.make,
        payload.model,
        payload.year
    );
    let car = CreateCarCommand::new(
        user_id,
        payload.display_name,
        payload.make,
        payload.model,
        payload.year,
        payload.vin,
        payload.license_plate,
        payload.notes,
        payload.insurance_document_id,
        payload.registration_document_id,
        use_cases.car_repository.clone(),
        use_cases.document_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::created(CarDto::from_domain(&car))
}

pub async fn list_cars(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Query(params): Query<GetCarsQueryParams>,
) -> ApiResult<Vec<CarDto>> {
    let cars = ListCarsQuery::new(
        user_id,
        params.include_inactive(),
        use_cases.car_repository.clone(),
    )
    .execute()
    .await;
    AppResponse::ok(cars.iter().map(CarDto::from_domain).collect())
}

pub async fn get_car(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Path(id): Path<Uuid>,
) -> ApiResult<CarDto> {
    use_cases
        .car_repository
        .load_owned(&CarId(id), &user_id)
        .await
        .map_or_else(AppResponse::not_found, |car| {
            AppResponse::ok(CarDto::from_domain(&car))
        })
}

pub async fn update_car(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateCarCommandDto>,
) -> ApiResult<CarDto> {
    let car = UpdateCarCommand::new(
        CarId(id),
        user_id,
        payload.display_name,
        payload.make,
        payload.model,
        payload.year,
        payload.vin,
        payload.license_plate,
        payload.notes,
        payload.insurance_document_id,
        payload.registration_document_id,
        payload.active,
        use_cases.car_repository.clone(),
        use_cases.document_repository.clone(),
    )
    .execute()
    .await?;
    AppResponse::ok(CarDto::from_domain(&car))
}

pub async fn deactivate_car(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Path(id): Path<Uuid>,
) -> ApiResult<CarDto> {
    let car = DeactivateCarCommand::new(CarId(id), user_id, use_cases.car_repository.clone())
        .execute()
        .await?;
    AppResponse::ok(CarDto::from_domain(&car))
}

pub async fn delete_car(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    tracing::info!("Deleting Car id={}", id);
    DeleteCarCommand::new(CarId(id), user_id, use_cases.car_repository.clone())
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
    use serde_json::from_slice;
    use uuid::Uuid;

    use super::*;
    use crate::application::car_use_cases::CarUseCases;
    use crate::application::document_repository::DocumentRepository;
    use crate::domain::document::Document;
    use crate::infrastructure::car::car_collection::CarCollection;
    use crate::infrastructure::document::document_collection::DocumentCollection;

    const SAMPLE_VIN: &str = "1HGCM82633A004352";

    fn test_auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "life-manager".to_string(),
        }
    }

    fn use_cases_with_collections()
    -> (Arc<CarUseCases>, Arc<CarCollection>, Arc<DocumentCollection>) {
        let cars = Arc::new(CarCollection::new());
        let docs = Arc::new(DocumentCollection::new());
        let use_cases = Arc::new(CarUseCases {
            car_repository: cars.clone(),
            document_repository: docs.clone(),
        });
        (use_cases, cars, docs)
    }

    fn create_payload(make: &str, model: &str, year: i32) -> CreateCarCommandDto {
        CreateCarCommandDto {
            display_name: None,
            make: make.to_string(),
            model: model.to_string(),
            year,
            vin: None,
            license_plate: None,
            notes: None,
            insurance_document_id: None,
            registration_document_id: None,
        }
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
    async fn given_valid_jwt_when_create_car_then_201_active_owned() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();

        let response = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .into_response();

        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(dto.make, "Toyota");
        assert!(dto.active);

        let stored = use_cases
            .car_repository
            .load_owned(&CarId(dto.id), &auth_user.user_id)
            .await
            .expect("owned");
        assert_eq!(stored.user_id, auth_user.user_id);
    }

    #[tokio::test]
    async fn given_owned_car_when_update_vin_and_plate_then_200() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        let response = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: Some(Some(SAMPLE_VIN.to_string())),
                license_plate: Some(Some("abc123".to_string())),
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
                active: None,
            }),
        )
        .await
        .into_response();

        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.vin.as_deref(), Some(SAMPLE_VIN));
        assert_eq!(dto.license_plate.as_deref(), Some("ABC123"));
    }

    #[tokio::test]
    async fn given_duplicate_vin_same_user_when_create_then_validation_error() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let mut first = create_payload("Toyota", "Corolla", 2020);
        first.vin = Some(SAMPLE_VIN.to_string());
        create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(first),
        )
        .await
        .expect("first");

        let mut second = create_payload("Honda", "Civic", 2021);
        second.vin = Some(SAMPLE_VIN.to_string());
        let result = create_car(
            auth_user,
            State(CarState(use_cases)),
            Json(second),
        )
        .await;
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn given_same_vin_different_users_when_create_then_201() {
        let user_a = test_auth_user();
        let user_b = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let mut payload = create_payload("Toyota", "Corolla", 2020);
        payload.vin = Some(SAMPLE_VIN.to_string());
        create_car(
            user_a,
            State(CarState(use_cases.clone())),
            Json(payload.clone()),
        )
        .await
        .expect("user a");

        let response = create_car(
            user_b,
            State(CarState(use_cases)),
            Json(payload),
        )
        .await
        .into_response();
        let (status, _): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::CREATED);
    }

    #[tokio::test]
    async fn given_owned_document_when_link_insurance_then_200() {
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let doc = Document::new("Insurance", "policy", auth_user.user_id);
        let doc_id = doc.id;
        docs.save_document(doc).await.expect("save doc");

        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        let response = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: Some(Some(doc_id)),
                registration_document_id: None,
                active: None,
            }),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.insurance_document_id, Some(doc_id));
    }

    #[tokio::test]
    async fn given_other_users_document_when_link_insurance_then_validation_error() {
        let auth_user = test_auth_user();
        let other = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let doc = Document::new("Insurance", "policy", other.user_id);
        let doc_id = doc.id;
        docs.save_document(doc).await.expect("save doc");

        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        let result = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: Some(Some(doc_id)),
                registration_document_id: None,
                active: None,
            }),
        )
        .await;
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn given_active_car_when_deactivate_then_inactive_and_get_still_works() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        let deactivate_response = deactivate_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, CarDto) = response_json(deactivate_response).await;
        assert_eq!(status, StatusCode::OK);
        assert!(!dto.active);

        let get_response = get_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
        )
        .await
        .into_response();
        let (get_status, get_dto): (StatusCode, CarDto) = response_json(get_response).await;
        assert_eq!(get_status, StatusCode::OK);
        assert!(!get_dto.active);
    }

    #[tokio::test]
    async fn given_owned_car_when_hard_delete_then_204_and_get_404() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        let delete_response = delete_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .into_response();
        assert_eq!(delete_response.status(), StatusCode::NO_CONTENT);

        let get_result = get_car(auth_user, State(CarState(use_cases)), Path(created.id)).await;
        assert!(matches!(
            get_result,
            Err(backend_utils::AppError::NotFound)
        ));
    }

    #[tokio::test]
    async fn given_active_and_inactive_when_list_default_then_only_active() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let active = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Active", 2020)),
        )
        .await
        .expect("create")
        .data;
        let inactive = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Honda", "Inactive", 2021)),
        )
        .await
        .expect("create")
        .data;
        deactivate_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Path(inactive.id),
        )
        .await
        .expect("deactivate");

        let response = list_cars(
            auth_user,
            State(CarState(use_cases)),
            Query(GetCarsQueryParams {
                include_inactive: None,
            }),
        )
        .await
        .into_response();
        let (status, list): (StatusCode, Vec<CarDto>) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, active.id);
    }

    #[tokio::test]
    async fn given_other_users_car_when_update_deactivate_or_delete_then_404() {
        let owner = test_auth_user();
        let other = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let created = create_car(
            owner,
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        let update_result = update_car(
            other.clone(),
            State(CarState(use_cases.clone())),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: None,
                make: "Hacked".to_string(),
                model: "Car".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
                active: None,
            }),
        )
        .await;
        assert!(matches!(
            update_result,
            Err(backend_utils::AppError::NotFound)
        ));

        let deactivate_result = deactivate_car(
            other.clone(),
            State(CarState(use_cases.clone())),
            Path(created.id),
        )
        .await;
        assert!(matches!(
            deactivate_result,
            Err(backend_utils::AppError::NotFound)
        ));

        let delete_result = delete_car(other, State(CarState(use_cases)), Path(created.id)).await;
        assert!(matches!(
            delete_result,
            Err(backend_utils::AppError::NotFound)
        ));
    }

    #[tokio::test]
    async fn given_inactive_when_reactivate_via_put_then_active() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;
        deactivate_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Path(created.id),
        )
        .await
        .expect("deactivate");

        let response = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
                active: Some(true),
            }),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert!(dto.active);
        assert!(dto.deactivated_at.is_none());
    }

    #[tokio::test]
    async fn given_kept_dangling_document_link_when_update_other_fields_then_200() {
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let doc = Document::new("Insurance", "policy", auth_user.user_id);
        let doc_id = doc.id;
        docs.save_document(doc).await.expect("save doc");

        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;

        update_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: Some(Some(doc_id)),
                registration_document_id: None,
                active: None,
            }),
        )
        .await
        .expect("link");

        docs.delete_document(doc_id).await.expect("delete doc");

        let response = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: Some(Some("Daily".to_string())),
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
                active: None,
            }),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.display_name.as_deref(), Some("Daily"));
        assert_eq!(dto.insurance_document_id, Some(doc_id));
    }

    #[tokio::test]
    async fn given_same_vin_on_same_car_when_update_then_ok() {
        let auth_user = test_auth_user();
        let (use_cases, _, _) = use_cases_with_collections();
        let mut payload = create_payload("Toyota", "Corolla", 2020);
        payload.vin = Some(SAMPLE_VIN.to_string());
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(payload),
        )
        .await
        .expect("create")
        .data;

        let response = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(UpdateCarCommandDto {
                display_name: Some(Some("Daily".to_string())),
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: Some(Some(SAMPLE_VIN.to_string())),
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
                active: None,
            }),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.display_name.as_deref(), Some("Daily"));
        assert_eq!(dto.vin.as_deref(), Some(SAMPLE_VIN));
    }
}
