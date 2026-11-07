#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use axum_test::TestServer;
use life_manager::infrastructure::car::car_api_types::{
    CreateCarCommandDto, UpdateCarCommandDto,
};
use life_manager::infrastructure::car::car_dto::CarDto;
use life_manager::infrastructure::document::document_api_types::CreateDocumentCommandDto;
use life_manager::infrastructure::document::document_dto::DocumentDto;
use reqwest::StatusCode;
use serial_test::serial;
use tracing_test::traced_test;
use uuid::Uuid;

use crate::common::setup::{
    build_auth_header, build_bearer_token_with_tenant, run_test_with_test_profile,
};

const CARS_URL: &str = "/life-manager/api/v1/cars";
const DOCUMENTS_URL: &str = "/life-manager/api/v1/documents";
const SAMPLE_VIN: &str = "1HGCM82633A004352";

#[tokio::test]
#[serial]
#[traced_test]
async fn given_valid_jwt_when_create_car_then_201_active_owned() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;
        assert!(created.active);
        assert!(created.deactivated_at.is_none());

        let get_url = server
            .server_url(&format!("{}/{}", CARS_URL, created.id))
            .expect("get url")
            .to_string();
        let get_res = reqwest::Client::new()
            .get(get_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("get");
        assert_eq!(get_res.status(), StatusCode::OK);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_car_when_put_vin_and_plate_then_200_updated() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;

        let url = server
            .server_url(&format!("{}/{}", CARS_URL, created.id))
            .expect("url")
            .to_string();
        let update = UpdateCarCommandDto {
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
        };
        let res = reqwest::Client::new()
            .put(url)
            .header("Authorization", &auth_header)
            .json(&update)
            .send()
            .await
            .expect("update");
        assert_eq!(res.status(), StatusCode::OK);
        let updated = res.json::<CarDto>().await.expect("json");
        assert_eq!(updated.vin.as_deref(), Some(SAMPLE_VIN));
        assert_eq!(updated.license_plate.as_deref(), Some("ABC123"));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_duplicate_vin_same_user_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        create_car(
            &server,
            &auth_header,
            "Toyota",
            "Corolla",
            2020,
            Some(SAMPLE_VIN),
            None,
        )
        .await;

        let url = server.server_url(CARS_URL).expect("url").to_string();
        let res = reqwest::Client::new()
            .post(url)
            .header("Authorization", &auth_header)
            .json(&CreateCarCommandDto {
                display_name: None,
                make: "Honda".to_string(),
                model: "Civic".to_string(),
                year: 2021,
                vin: Some(SAMPLE_VIN.to_string()),
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
            })
            .send()
            .await
            .expect("create");
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_duplicate_plate_same_user_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        create_car(
            &server,
            &auth_header,
            "Toyota",
            "Corolla",
            2020,
            None,
            Some("ABC123"),
        )
        .await;

        let url = server.server_url(CARS_URL).expect("url").to_string();
        let res = reqwest::Client::new()
            .post(url)
            .header("Authorization", &auth_header)
            .json(&CreateCarCommandDto {
                display_name: None,
                make: "Honda".to_string(),
                model: "Civic".to_string(),
                year: 2021,
                vin: None,
                license_plate: Some("abc123".to_string()),
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
            })
            .send()
            .await
            .expect("create");
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_same_vin_different_users_when_create_then_201() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        create_car(
            &server,
            &auth_header,
            "Toyota",
            "Corolla",
            2020,
            Some(SAMPLE_VIN),
            None,
        )
        .await;

        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");
        let url = server.server_url(CARS_URL).expect("url").to_string();
        let res = reqwest::Client::new()
            .post(url)
            .header("Authorization", &other_header)
            .json(&CreateCarCommandDto {
                display_name: None,
                make: "Honda".to_string(),
                model: "Civic".to_string(),
                year: 2021,
                vin: Some(SAMPLE_VIN.to_string()),
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
            })
            .send()
            .await
            .expect("create");
        assert_eq!(res.status(), StatusCode::CREATED);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_document_when_link_insurance_then_200() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let doc = create_document(&server, &auth_header, "Insurance").await;
        let car = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;

        let url = server
            .server_url(&format!("{}/{}", CARS_URL, car.id))
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .put(url)
            .header("Authorization", &auth_header)
            .json(&UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: Some(Some(doc.id)),
                registration_document_id: None,
                active: None,
            })
            .send()
            .await
            .expect("update");
        assert_eq!(res.status(), StatusCode::OK);
        let updated = res.json::<CarDto>().await.expect("json");
        assert_eq!(updated.insurance_document_id, Some(doc.id));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_document_when_link_insurance_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");
        let other_doc = create_document(&server, &other_header, "Other Insurance").await;
        let car = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;

        let url = server
            .server_url(&format!("{}/{}", CARS_URL, car.id))
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .put(url)
            .header("Authorization", &auth_header)
            .json(&UpdateCarCommandDto {
                display_name: None,
                make: "Toyota".to_string(),
                model: "Corolla".to_string(),
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: Some(Some(other_doc.id)),
                registration_document_id: None,
                active: None,
            })
            .send()
            .await
            .expect("update");
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_active_car_when_deactivate_then_inactive_row_remains_get_works() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;

        let deactivate_url = server
            .server_url(&format!("{}/{}/deactivate", CARS_URL, created.id))
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .post(deactivate_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("deactivate");
        assert_eq!(res.status(), StatusCode::OK);
        let body = res.json::<CarDto>().await.expect("json");
        assert!(!body.active);

        let get_url = server
            .server_url(&format!("{}/{}", CARS_URL, created.id))
            .expect("get url")
            .to_string();
        let get_res = reqwest::Client::new()
            .get(get_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("get");
        assert_eq!(get_res.status(), StatusCode::OK);
        let got = get_res.json::<CarDto>().await.expect("json");
        assert!(!got.active);
        assert!(got.deactivated_at.is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_car_when_hard_delete_then_204_and_get_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;

        let delete_url = server
            .server_url(&format!("{}/{}", CARS_URL, created.id))
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .delete(&delete_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("delete");
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let get_res = reqwest::Client::new()
            .get(delete_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("get");
        assert_eq!(get_res.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_active_and_inactive_when_list_default_then_only_active() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let active = create_car(&server, &auth_header, "Toyota", "Active", 2020, None, None)
            .await;
        let inactive =
            create_car(&server, &auth_header, "Honda", "Inactive", 2021, None, None).await;
        deactivate_car(&server, &auth_header, inactive.id).await;

        let url = server.server_url(CARS_URL).expect("url").to_string();
        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("list");
        assert_eq!(res.status(), StatusCode::OK);
        let list = res.json::<Vec<CarDto>>().await.expect("json");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, active.id);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_car_when_update_deactivate_or_delete_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_car(&server, &auth_header, "Toyota", "Corolla", 2020, None, None)
            .await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");

        let update_url = server
            .server_url(&format!("{}/{}", CARS_URL, created.id))
            .expect("url")
            .to_string();
        let update_res = reqwest::Client::new()
            .put(&update_url)
            .header("Authorization", &other_header)
            .json(&UpdateCarCommandDto {
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
            })
            .send()
            .await
            .expect("update");
        assert_eq!(update_res.status(), StatusCode::NOT_FOUND);

        let deactivate_url = server
            .server_url(&format!("{}/{}/deactivate", CARS_URL, created.id))
            .expect("url")
            .to_string();
        let deactivate_res = reqwest::Client::new()
            .post(deactivate_url)
            .header("Authorization", &other_header)
            .send()
            .await
            .expect("deactivate");
        assert_eq!(deactivate_res.status(), StatusCode::NOT_FOUND);

        let delete_res = reqwest::Client::new()
            .delete(update_url)
            .header("Authorization", &other_header)
            .send()
            .await
            .expect("delete");
        assert_eq!(delete_res.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

async fn create_car(
    server: &TestServer,
    auth_header: &str,
    make: &str,
    model: &str,
    year: i32,
    vin: Option<&str>,
    license_plate: Option<&str>,
) -> CarDto {
    let url = server.server_url(CARS_URL).expect("url").to_string();
    let res = reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .json(&CreateCarCommandDto {
            display_name: None,
            make: make.to_string(),
            model: model.to_string(),
            year,
            vin: vin.map(|v| v.to_string()),
            license_plate: license_plate.map(|p| p.to_string()),
            notes: None,
            insurance_document_id: None,
            registration_document_id: None,
        })
        .send()
        .await
        .expect("create");
    assert_eq!(res.status(), StatusCode::CREATED);
    res.json().await.expect("json")
}

async fn deactivate_car(server: &TestServer, auth_header: &str, id: Uuid) {
    let url = server
        .server_url(&format!("{CARS_URL}/{id}/deactivate"))
        .expect("url")
        .to_string();
    let res = reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("deactivate");
    assert_eq!(res.status(), StatusCode::OK);
}

async fn create_document(server: &TestServer, auth_header: &str, title: &str) -> DocumentDto {
    let payload = CreateDocumentCommandDto {
        title: title.to_string(),
        content: "content".to_string(),
        tags: vec![],
        issued_date: None,
        expire_date: None,
        storage: None,
    };
    let json_string = serde_json::to_string(&payload).unwrap();
    let multipart_body = format!(
        "--boundary\r\n\
        Content-Disposition: form-data; name=\"json\"\r\n\
        Content-Type: application/json\r\n\r\n\
        {json_string}\r\n\
        --boundary--"
    );
    let url = server.server_url(DOCUMENTS_URL).expect("url").to_string();
    let res = reqwest::Client::new()
        .post(url)
        .body(multipart_body)
        .header("Content-Type", "multipart/form-data; boundary=boundary")
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("create document");
    assert!(res.status().is_success());
    res.json().await.expect("json")
}
