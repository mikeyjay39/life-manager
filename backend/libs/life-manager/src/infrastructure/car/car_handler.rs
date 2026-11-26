use auth::AuthUser;
use axum::Json;
use axum::extract::{Path, Query, State};
use backend_utils::AppResponse;
use backend_utils::app_result::ApiResult;
use uuid::Uuid;

use crate::application::car::create_car_command::CreateCarCommand;
use crate::application::car::deactivate_car_command::DeactivateCarCommand;
use crate::application::car::delete_car_command::DeleteCarCommand;
use crate::application::car::list_cars_query::ListCarsQuery;
use crate::application::car::update_car_command::UpdateCarCommand;
use crate::domain::car::CarId;
use crate::infrastructure::car::car_api_types::{
    CreateCarCommandDto, GetCarsQueryParams, UpdateCarCommandDto,
};
use crate::infrastructure::car::car_dto::CarDto;
use crate::infrastructure::car::car_state::CarState;
use crate::infrastructure::document::mappers::{DocumentLinkFields, document_link_from_dto};

const INSURANCE_DOCUMENT_FIELDS: DocumentLinkFields = DocumentLinkFields {
    id: "insurance_document_id",
    new: "new_insurance_document",
};
const REGISTRATION_DOCUMENT_FIELDS: DocumentLinkFields = DocumentLinkFields {
    id: "registration_document_id",
    new: "new_registration_document",
};

/// Creates a Car owned by the authenticated user.
///
/// Optional `new_insurance_document` / `new_registration_document` create the
/// Documents and link them in the same transaction as the Car INSERT.
///
/// ```text
/// Client          create_car           CreateCarCommand           CarRepository /
///   |             (handler)                  |                    CarDocumentsWriter (SQLite)
///   | POST /cars       |                     |                           |
///   | { make, model, year, ...,              |                           |
///   |   new_*_document? }                    |                           |
///   |----------------->|                     |                           |
///   |                  | role id + new_* -> 400                          |
///   |                  | each role -> DocumentLink: None / Existing(id) /|
///   |                  |   New(Document, owner = JWT user_id)            |
///   |                  | (bad storage -> 400)|                           |
///   |                  |-------------------->|                           |
///   |                  |                     | verify owned Existing ids |
///   |                  |                     | Car::create (link new ids)|
///   |                  |                     | unique VIN / plate check  |
///   |                  |                     | no new_*: save ---------->| INSERT cars
///   |                  |                     | new_*: writer.create ---->| BEGIN
///   |                  |                     |                           |  INSERT documents + tags
///   |                  |                     |                           |  INSERT cars
///   |                  |                     |                           | COMMIT (any error: ROLLBACK)
///   |  201 CarDto      |<--------------------|<--------------------------|
///   |<-----------------|                     |                           |
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
    let insurance_document = document_link_from_dto(
        payload.insurance_document_id,
        payload.new_insurance_document,
        user_id,
        &INSURANCE_DOCUMENT_FIELDS,
    )?;
    let registration_document = document_link_from_dto(
        payload.registration_document_id,
        payload.new_registration_document,
        user_id,
        &REGISTRATION_DOCUMENT_FIELDS,
    )?;
    let car = CreateCarCommand::new(
        user_id,
        payload.display_name,
        payload.make,
        payload.model,
        payload.year,
        payload.vin,
        payload.license_plate,
        payload.notes,
        insurance_document,
        registration_document,
        use_cases.car_repository.clone(),
        use_cases.document_repository.clone(),
        use_cases.car_documents_writer.clone(),
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

/// Updates an owned Car. Optional profile fields are PATCH-style (omit keeps).
/// The insurance and registration links are replaced on each PUT.
///
/// Optional `new_insurance_document` / `new_registration_document` create the
/// Documents and link them in the same IMMEDIATE transaction as the Car UPDATE.
///
/// ```text
/// Client          update_car           UpdateCarCommand           CarRepository /
///   |             (handler)                  |                    CarDocumentsWriter (SQLite)
///   | PUT /cars/{id}   |                     |                           |
///   | { make, model, year, ...,              |                           |
///   |   new_*_document? }                    |                           |
///   |----------------->|                     |                           |
///   |                  | role id + new_* -> 400                          |
///   |                  | each role -> DocumentLink, replaces the link:   |
///   |                  |   None (null or omitted) / Existing / New       |
///   |                  | (bad storage -> 400)|                           |
///   |                  |-------------------->|                           |
///   |                  |                     | load_owned Car (else 404) |
///   |                  |                     | verify newly linked ids   |
///   |                  |                     | update_profile (link new) |
///   |                  |                     | unique VIN / plate check  |
///   |                  |                     | no new_*: update -------->| UPDATE cars
///   |                  |                     | new_*: writer.update ---->| BEGIN IMMEDIATE
///   |                  |                     |                           |  INSERT documents + tags
///   |                  |                     |                           |  UPDATE cars (0 rows: 404)
///   |                  |                     |                           | COMMIT (any error: ROLLBACK)
///   |  200 CarDto      |<--------------------|<--------------------------|
///   |<-----------------|                     |                           |
/// ```
pub async fn update_car(
    AuthUser {
        user_id,
        tenant: _tenant,
    }: AuthUser,
    State(CarState(use_cases)): State<CarState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateCarCommandDto>,
) -> ApiResult<CarDto> {
    let insurance_document = document_link_from_dto(
        payload.insurance_document_id,
        payload.new_insurance_document,
        user_id,
        &INSURANCE_DOCUMENT_FIELDS,
    )?;
    let registration_document = document_link_from_dto(
        payload.registration_document_id,
        payload.new_registration_document,
        user_id,
        &REGISTRATION_DOCUMENT_FIELDS,
    )?;
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
        insurance_document,
        registration_document,
        payload.active,
        use_cases.car_repository.clone(),
        use_cases.document_repository.clone(),
        use_cases.car_documents_writer.clone(),
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

    use axum::Json;
    use axum::body::to_bytes;
    use axum::extract::{Path, Query, State};
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use serde_json::from_slice;
    use uuid::Uuid;

    use super::*;
    use crate::application::car::car_repository::tests::CarCollection;
    use crate::application::car::car_use_cases::CarUseCases;
    use crate::application::document::document_repository::DocumentRepository;
    use crate::domain::document::Document;
    use crate::domain::document::document_storage_ref::STORAGE_PROVIDER_PROTON_DRIVE;
    use crate::infrastructure::document::document_api_types::{
        CreateDocumentCommandDto, DocumentStorageRefDto,
    };
    use async_trait::async_trait;

    use crate::application::car::car_documents_writer::CarDocumentsWriter;
    use crate::application::car::car_repository::CarRepository;
    use crate::application::document::document_repository::tests::DocumentCollection;
    use crate::domain::car::Car;

    const SAMPLE_VIN: &str = "1HGCM82633A004352";

    fn test_auth_user() -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            tenant: "life-manager".to_string(),
        }
    }

    fn use_cases_with_collections() -> (
        Arc<CarUseCases>,
        Arc<CarCollection>,
        Arc<DocumentCollection>,
    ) {
        let cars = Arc::new(CarCollection::new());
        let docs = Arc::new(DocumentCollection::new());
        let use_cases = Arc::new(CarUseCases {
            car_repository: cars.clone(),
            document_repository: docs.clone(),
            car_documents_writer: Arc::new(CarDocumentsCollection::new(cars.clone(), docs.clone())),
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
            new_insurance_document: None,
            new_registration_document: None,
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
                new_insurance_document: None,
                new_registration_document: None,
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
        let result = create_car(auth_user, State(CarState(use_cases)), Json(second)).await;
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

        let response = create_car(user_b, State(CarState(use_cases)), Json(payload))
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
                insurance_document_id: Some(doc_id),
                registration_document_id: None,
                active: None,
                new_insurance_document: None,
                new_registration_document: None,
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
                insurance_document_id: Some(doc_id),
                registration_document_id: None,
                active: None,
                new_insurance_document: None,
                new_registration_document: None,
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

        let get_response = get_car(auth_user, State(CarState(use_cases)), Path(created.id))
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
        assert!(matches!(get_result, Err(backend_utils::AppError::NotFound)));
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
                new_insurance_document: None,
                new_registration_document: None,
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
                new_insurance_document: None,
                new_registration_document: None,
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
    async fn given_stored_dangling_document_id_sent_again_when_update_other_fields_then_200() {
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
                insurance_document_id: Some(doc_id),
                registration_document_id: None,
                active: None,
                new_insurance_document: None,
                new_registration_document: None,
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
                insurance_document_id: Some(doc_id),
                registration_document_id: None,
                active: None,
                new_insurance_document: None,
                new_registration_document: None,
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
    async fn given_linked_car_when_update_omits_document_ids_then_links_cleared() {
        // Given a Car with both links
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let insurance = Document::new("Insurance", "policy", auth_user.user_id);
        let registration = Document::new("Registration", "card", auth_user.user_id);
        let mut create = create_payload("Toyota", "Corolla", 2020);
        create.insurance_document_id = Some(insurance.id);
        create.registration_document_id = Some(registration.id);
        docs.save_document(insurance).await.expect("save doc");
        docs.save_document(registration).await.expect("save doc");
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create),
        )
        .await
        .expect("create")
        .data;

        // When a PUT omits both ids
        let dto = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(update_payload_no_links()),
        )
        .await
        .expect("update")
        .data;

        // Then each PUT replaces the links, so both are cleared
        assert_eq!(dto.insurance_document_id, None);
        assert_eq!(dto.registration_document_id, None);
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
                new_insurance_document: None,
                new_registration_document: None,
            }),
        )
        .await
        .into_response();
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(dto.display_name.as_deref(), Some("Daily"));
        assert_eq!(dto.vin.as_deref(), Some(SAMPLE_VIN));
    }

    fn new_document_payload(title: &str) -> CreateDocumentCommandDto {
        CreateDocumentCommandDto {
            title: title.to_string(),
            content: "summary".to_string(),
            tags: vec!["Car".to_string()],
            issued_date: None,
            expire_date: None,
            storage: Some(DocumentStorageRefDto {
                provider: STORAGE_PROVIDER_PROTON_DRIVE.to_string(),
                share_id: "share".to_string(),
                node_id: "node".to_string(),
                filename: format!("{title}.pdf"),
                mime_type: Some("application/pdf".to_string()),
            }),
        }
    }

    fn update_payload_no_links() -> UpdateCarCommandDto {
        UpdateCarCommandDto {
            display_name: None,
            make: "Toyota".to_string(),
            model: "Corolla".to_string(),
            year: 2020,
            vin: None,
            license_plate: None,
            notes: None,
            insurance_document_id: None,
            registration_document_id: None,
            active: None,
            new_insurance_document: None,
            new_registration_document: None,
        }
    }

    async fn stored_document(docs: &DocumentCollection, id: Uuid) -> Document {
        docs.documents
            .lock()
            .await
            .iter()
            .find(|d| d.id == id)
            .cloned()
            .expect("stored document")
    }

    #[tokio::test]
    async fn given_new_insurance_and_registration_documents_when_create_car_then_201_and_both_linked()
     {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let mut payload = create_payload("Toyota", "Corolla", 2020);
        payload.new_insurance_document = Some(new_document_payload("Insurance"));
        payload.new_registration_document = Some(new_document_payload("Registration"));

        // When
        let response = create_car(auth_user.clone(), State(CarState(use_cases)), Json(payload))
            .await
            .into_response();

        // Then
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::CREATED);
        let insurance = stored_document(&docs, dto.insurance_document_id.expect("insurance")).await;
        let registration =
            stored_document(&docs, dto.registration_document_id.expect("registration")).await;
        assert_eq!(insurance.title, "Insurance");
        assert_eq!(insurance.user_id, auth_user.user_id);
        assert_eq!(insurance.get_tags(), &vec!["car".to_string()]);
        assert!(insurance.storage.is_some());
        assert_eq!(registration.title, "Registration");
        assert_eq!(docs.documents.lock().await.len(), 2);
    }

    #[tokio::test]
    async fn given_new_document_without_storage_when_create_car_then_201_and_linked() {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let mut payload = create_payload("Toyota", "Corolla", 2020);
        let mut document = new_document_payload("Paper registration");
        document.storage = None;
        payload.new_registration_document = Some(document);

        // When
        let dto = create_car(auth_user, State(CarState(use_cases)), Json(payload))
            .await
            .expect("create")
            .data;

        // Then
        let stored = stored_document(&docs, dto.registration_document_id.expect("linked")).await;
        assert!(stored.storage.is_none());
        assert_eq!(dto.insurance_document_id, None);
    }

    #[tokio::test]
    async fn given_owned_car_when_update_with_new_documents_then_200_and_both_linked() {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;
        let mut payload = update_payload_no_links();
        payload.new_insurance_document = Some(new_document_payload("Insurance 2027"));
        payload.new_registration_document = Some(new_document_payload("Registration 2027"));

        // When
        let response = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(payload),
        )
        .await
        .into_response();

        // Then
        let (status, dto): (StatusCode, CarDto) = response_json(response).await;
        assert_eq!(status, StatusCode::OK);
        let insurance = stored_document(&docs, dto.insurance_document_id.expect("insurance")).await;
        let registration =
            stored_document(&docs, dto.registration_document_id.expect("registration")).await;
        assert_eq!(insurance.title, "Insurance 2027");
        assert_eq!(registration.title, "Registration 2027");
    }

    #[tokio::test]
    async fn given_linked_insurance_when_update_with_null_id_and_new_document_then_new_document_linked()
     {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let old = Document::new("Old insurance", "policy", auth_user.user_id);
        let old_id = old.id;
        docs.save_document(old).await.expect("save doc");
        let mut create = create_payload("Toyota", "Corolla", 2020);
        create.insurance_document_id = Some(old_id);
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create),
        )
        .await
        .expect("create")
        .data;
        let mut payload = update_payload_no_links();
        payload.insurance_document_id = None;
        payload.new_insurance_document = Some(new_document_payload("New insurance"));

        // When
        let dto = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(payload),
        )
        .await
        .expect("update")
        .data;

        // Then
        let linked = dto.insurance_document_id.expect("linked");
        assert_ne!(linked, old_id);
        assert_eq!(stored_document(&docs, linked).await.title, "New insurance");
    }

    #[tokio::test]
    async fn given_id_and_new_document_for_same_role_when_create_car_then_validation_and_nothing_stored()
     {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, cars, docs) = use_cases_with_collections();
        let owned = Document::new("Insurance", "policy", auth_user.user_id);
        let owned_id = owned.id;
        docs.save_document(owned).await.expect("save doc");
        let mut payload = create_payload("Toyota", "Corolla", 2020);
        payload.insurance_document_id = Some(owned_id);
        payload.new_insurance_document = Some(new_document_payload("Insurance"));

        // When
        let result = create_car(auth_user, State(CarState(use_cases)), Json(payload)).await;

        // Then
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
        assert!(cars.cars.lock().await.is_empty());
        assert_eq!(docs.documents.lock().await.len(), 1);
    }

    #[tokio::test]
    async fn given_id_and_new_document_for_same_role_when_update_car_then_validation_and_nothing_stored()
     {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
        let created = create_car(
            auth_user.clone(),
            State(CarState(use_cases.clone())),
            Json(create_payload("Toyota", "Corolla", 2020)),
        )
        .await
        .expect("create")
        .data;
        let mut payload = update_payload_no_links();
        payload.registration_document_id = Some(Uuid::new_v4());
        payload.new_registration_document = Some(new_document_payload("Registration"));

        // When
        let result = update_car(
            auth_user,
            State(CarState(use_cases)),
            Path(created.id),
            Json(payload),
        )
        .await;

        // Then
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
        assert!(docs.documents.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_invalid_storage_in_new_document_when_create_car_then_validation_and_nothing_stored()
     {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, cars, docs) = use_cases_with_collections();
        let mut document = new_document_payload("Insurance");
        if let Some(storage) = document.storage.as_mut() {
            storage.provider = "dropbox".to_string();
        }
        let mut payload = create_payload("Toyota", "Corolla", 2020);
        payload.new_insurance_document = Some(document);

        // When
        let result = create_car(auth_user, State(CarState(use_cases)), Json(payload)).await;

        // Then
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
        assert!(cars.cars.lock().await.is_empty());
        assert!(docs.documents.lock().await.is_empty());
    }

    #[tokio::test]
    async fn given_duplicate_vin_when_create_car_with_new_document_then_validation_and_no_document()
    {
        // Given
        let auth_user = test_auth_user();
        let (use_cases, _, docs) = use_cases_with_collections();
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
        second.new_insurance_document = Some(new_document_payload("Insurance"));

        // When
        let result = create_car(auth_user, State(CarState(use_cases)), Json(second)).await;

        // Then
        assert!(matches!(
            result,
            Err(backend_utils::AppError::Validation(_))
        ));
        assert!(docs.documents.lock().await.is_empty());
    }

    #[test]
    fn given_null_new_document_when_deserialize_create_car_then_same_as_absent() {
        let dto: CreateCarCommandDto = serde_json::from_value(serde_json::json!({
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "new_insurance_document": null
        }))
        .unwrap();
        assert!(dto.new_insurance_document.is_none());
        assert!(dto.new_registration_document.is_none());
    }

    /// In-memory `CarDocumentsWriter` mock for these tests. It writes the Documents only
    /// after the Car write succeeds, so a failed Car write leaves no Document.
    struct CarDocumentsCollection {
        car_repository: Arc<dyn CarRepository>,
        document_repository: Arc<dyn DocumentRepository>,
    }

    impl CarDocumentsCollection {
        fn new(
            car_repository: Arc<dyn CarRepository>,
            document_repository: Arc<dyn DocumentRepository>,
        ) -> Self {
            Self {
                car_repository,
                document_repository,
            }
        }

        async fn save_documents(
            &self,
            new_documents: Vec<Document>,
        ) -> Result<(), Box<dyn std::error::Error>> {
            for document in new_documents {
                self.document_repository.save_document(document).await?;
            }
            Ok(())
        }
    }

    #[async_trait]
    impl CarDocumentsWriter for CarDocumentsCollection {
        async fn create(
            &self,
            car: Car,
            new_documents: Vec<Document>,
        ) -> Result<Car, Box<dyn std::error::Error>> {
            let saved = self.car_repository.save(car).await?;
            self.save_documents(new_documents).await?;
            Ok(saved)
        }

        async fn update(
            &self,
            car: Car,
            new_documents: Vec<Document>,
        ) -> Result<Car, Box<dyn std::error::Error>> {
            let saved = self.car_repository.update(car).await?;
            self.save_documents(new_documents).await?;
            Ok(saved)
        }
    }
}
