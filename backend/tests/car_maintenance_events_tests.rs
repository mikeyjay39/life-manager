#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use axum_test::TestServer;
use chrono::{NaiveDate, Utc};
use life_manager::infrastructure::car::car_api_types::CreateCarCommandDto;
use life_manager::infrastructure::car::car_dto::CarDto;
use life_manager::infrastructure::car_maintenance_event::car_maintenance_event_api_types::{
    CreateCarMaintenanceEventCommandDto, UpdateCarMaintenanceEventCommandDto,
};
use life_manager::infrastructure::car_maintenance_event::car_maintenance_event_dto::CarMaintenanceEventDto;
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
const EVENTS_URL: &str = "/life-manager/api/v1/car-maintenance-events";
const DOCUMENTS_URL: &str = "/life-manager/api/v1/documents";

fn day(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

fn event_payload(car_id: Uuid, occurred_on: NaiveDate) -> CreateCarMaintenanceEventCommandDto {
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

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_active_car_when_create_event_with_cost_then_201() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let occurred_on = day(2026, 1, 15);

        let res = post_event(&server, &auth_header, event_payload(car.id, occurred_on)).await;

        assert_eq!(res.status(), StatusCode::CREATED);
        let created = res.json::<CarMaintenanceEventDto>().await.expect("json");
        assert_eq!(created.car_id, car.id);
        assert_eq!(created.event_type, "oil_change");
        assert_eq!(created.odometer_miles, Some(50_000));
        assert_eq!(created.cost_cents, Some(5_999));
        assert_eq!(created.occurred_on, occurred_on);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_inactive_car_when_create_event_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        deactivate_car(&server, &auth_header, car.id).await;

        let res = post_event(
            &server,
            &auth_header,
            event_payload(car.id, day(2026, 1, 15)),
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let list = list_events(&server, &auth_header, car.id, None, None, None).await;
        assert!(list.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_events_for_two_cars_when_list_by_car_then_newest_first() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car1 = create_car(&server, &auth_header).await;
        let car2 = create_car_named(&server, &auth_header, "Honda", "Civic", 2019).await;
        let d1 = day(2026, 1, 10);
        let d2 = day(2026, 1, 20);
        create_event(&server, &auth_header, car1.id, d1).await;
        create_event(&server, &auth_header, car1.id, d2).await;
        create_event(&server, &auth_header, car2.id, d2).await;

        let list = list_events(&server, &auth_header, car1.id, None, None, None).await;
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].occurred_on, d2);
        assert_eq!(list[1].occurred_on, d1);
        assert!(list.iter().all(|e| e.car_id == car1.id));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_event_when_get_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");

        let res = get_event(&server, &other_header, created.id).await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_auth_when_call_endpoints_then_401() {
    run_test_with_test_profile(|server: TestServer| async move {
        let client = reqwest::Client::new();
        let base = server.server_url(EVENTS_URL).expect("url").to_string();
        let item = format!("{base}/{}", Uuid::new_v4());

        let post = client
            .post(&base)
            .json(&event_payload(Uuid::new_v4(), day(2026, 1, 15)))
            .send()
            .await
            .expect("post");
        assert_eq!(post.status(), StatusCode::UNAUTHORIZED);

        let list = client
            .get(format!("{base}?car_id={}", Uuid::new_v4()))
            .send()
            .await
            .expect("list");
        assert_eq!(list.status(), StatusCode::UNAUTHORIZED);

        let get = client.get(&item).send().await.expect("get");
        assert_eq!(get.status(), StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_missing_car_id_when_list_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let url = server.server_url(EVENTS_URL).expect("url").to_string();
        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("list");
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_invalid_event_type_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let mut payload = event_payload(car.id, day(2026, 1, 15));
        payload.event_type = "bogus".to_string();

        let res = post_event(&server, &auth_header, payload).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_negative_cost_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let mut payload = event_payload(car.id, day(2026, 1, 15));
        payload.cost_cents = Some(-1);

        let res = post_event(&server, &auth_header, payload).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_empty_detail_fields_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;

        let res = post_event(
            &server,
            &auth_header,
            CreateCarMaintenanceEventCommandDto {
                car_id: car.id,
                occurred_on: day(2026, 1, 15),
                event_type: "service".to_string(),
                odometer_miles: None,
                cost_cents: None,
                title: Some("  ".to_string()),
                notes: Some("".to_string()),
                document_id: None,
            },
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_document_when_create_with_document_id_then_201() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let doc = create_document(&server, &auth_header, "Receipt").await;
        let mut payload = event_payload(car.id, day(2026, 1, 15));
        payload.document_id = Some(doc.id);

        let res = post_event(&server, &auth_header, payload).await;
        assert_eq!(res.status(), StatusCode::CREATED);
        let created = res.json::<CarMaintenanceEventDto>().await.expect("json");
        assert_eq!(created.document_id, Some(doc.id));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_document_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");
        let car = create_car(&server, &auth_header).await;
        let other_doc = create_document(&server, &other_header, "Other Receipt").await;
        let mut payload = event_payload(car.id, day(2026, 1, 15));
        payload.document_id = Some(other_doc.id);

        let res = post_event(&server, &auth_header, payload).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_event_type_filter_when_list_then_only_matching() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        create_event(&server, &auth_header, car.id, day(2026, 1, 10)).await;
        let mut tire = event_payload(car.id, day(2026, 1, 12));
        tire.event_type = "tire".to_string();
        tire.odometer_miles = None;
        tire.cost_cents = None;
        tire.title = Some("Rotate".to_string());
        let res = post_event(&server, &auth_header, tire).await;
        assert_eq!(res.status(), StatusCode::CREATED);

        let list = list_events(
            &server,
            &auth_header,
            car.id,
            None,
            None,
            Some("tire"),
        )
        .await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].event_type, "tire");
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_future_date_when_create_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);

        let res = post_event(&server, &auth_header, event_payload(car.id, tomorrow)).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_event_when_get_then_200() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;

        let res = get_event(&server, &auth_header, created.id).await;
        assert_eq!(res.status(), StatusCode::OK);
        let got = res.json::<CarMaintenanceEventDto>().await.expect("json");
        assert_eq!(got, created);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_event_when_update_odometer_and_cost_then_200() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;

        let res = put_event(
            &server,
            &auth_header,
            created.id,
            UpdateCarMaintenanceEventCommandDto {
                occurred_on: created.occurred_on,
                event_type: "service".to_string(),
                odometer_miles: Some(60_000),
                cost_cents: Some(7_500),
                title: None,
                notes: None,
                document_id: None,
            },
        )
        .await;

        assert_eq!(res.status(), StatusCode::OK);
        let updated = res.json::<CarMaintenanceEventDto>().await.expect("json");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.car_id, created.car_id);
        assert_eq!(updated.odometer_miles, Some(60_000));
        assert_eq!(updated.cost_cents, Some(7_500));
        assert_eq!(updated.event_type, "service");
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_inactive_car_when_update_event_then_200() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;
        deactivate_car(&server, &auth_header, car.id).await;

        let res = put_event(
            &server,
            &auth_header,
            created.id,
            UpdateCarMaintenanceEventCommandDto {
                occurred_on: created.occurred_on,
                event_type: "oil_change".to_string(),
                odometer_miles: Some(55_000),
                cost_cents: Some(6_000),
                title: None,
                notes: None,
                document_id: None,
            },
        )
        .await;

        assert_eq!(res.status(), StatusCode::OK);
        let updated = res.json::<CarMaintenanceEventDto>().await.expect("json");
        assert_eq!(updated.odometer_miles, Some(55_000));
        assert_eq!(updated.cost_cents, Some(6_000));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_event_when_update_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");

        let res = put_event(
            &server,
            &other_header,
            created.id,
            UpdateCarMaintenanceEventCommandDto {
                occurred_on: created.occurred_on,
                event_type: "service".to_string(),
                odometer_miles: Some(60_000),
                cost_cents: Some(7_500),
                title: None,
                notes: None,
                document_id: None,
            },
        )
        .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_negative_cost_when_update_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;

        let res = put_event(
            &server,
            &auth_header,
            created.id,
            UpdateCarMaintenanceEventCommandDto {
                occurred_on: created.occurred_on,
                event_type: "oil_change".to_string(),
                odometer_miles: Some(50_000),
                cost_cents: Some(-1),
                title: None,
                notes: None,
                document_id: None,
            },
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_event_when_delete_then_204_and_get_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;

        let del = delete_event(&server, &auth_header, created.id).await;
        assert_eq!(del.status(), StatusCode::NO_CONTENT);

        let get = get_event(&server, &auth_header, created.id).await;
        assert_eq!(get.status(), StatusCode::NOT_FOUND);

        let second = delete_event(&server, &auth_header, created.id).await;
        assert_eq!(second.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_event_when_delete_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let car = create_car(&server, &auth_header).await;
        let created = create_event(&server, &auth_header, car.id, day(2026, 1, 15)).await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");

        let res = delete_event(&server, &other_header, created.id).await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);

        let still = get_event(&server, &auth_header, created.id).await;
        assert_eq!(still.status(), StatusCode::OK);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_auth_when_put_or_delete_then_401() {
    run_test_with_test_profile(|server: TestServer| async move {
        let client = reqwest::Client::new();
        let item = server
            .server_url(&format!("{EVENTS_URL}/{}", Uuid::new_v4()))
            .expect("url")
            .to_string();

        let put = client
            .put(&item)
            .json(&UpdateCarMaintenanceEventCommandDto {
                occurred_on: day(2026, 1, 15),
                event_type: "service".to_string(),
                odometer_miles: Some(1),
                cost_cents: None,
                title: None,
                notes: None,
                document_id: None,
            })
            .send()
            .await
            .expect("put");
        assert_eq!(put.status(), StatusCode::UNAUTHORIZED);

        let del = client.delete(&item).send().await.expect("delete");
        assert_eq!(del.status(), StatusCode::UNAUTHORIZED);
    })
    .await;
}

async fn create_car(server: &TestServer, auth_header: &str) -> CarDto {
    create_car_named(server, auth_header, "Toyota", "Corolla", 2020).await
}

async fn create_car_named(
    server: &TestServer,
    auth_header: &str,
    make: &str,
    model: &str,
    year: i32,
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
            vin: None,
            license_plate: None,
            notes: None,
            insurance_document_id: None,
            registration_document_id: None,
        })
        .send()
        .await
        .expect("create car");
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

async fn post_event(
    server: &TestServer,
    auth_header: &str,
    payload: CreateCarMaintenanceEventCommandDto,
) -> reqwest::Response {
    let url = server.server_url(EVENTS_URL).expect("url").to_string();
    reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .json(&payload)
        .send()
        .await
        .expect("post event")
}

async fn create_event(
    server: &TestServer,
    auth_header: &str,
    car_id: Uuid,
    occurred_on: NaiveDate,
) -> CarMaintenanceEventDto {
    let res = post_event(server, auth_header, event_payload(car_id, occurred_on)).await;
    assert_eq!(res.status(), StatusCode::CREATED);
    res.json().await.expect("json")
}

async fn get_event(server: &TestServer, auth_header: &str, id: Uuid) -> reqwest::Response {
    let url = server
        .server_url(&format!("{EVENTS_URL}/{id}"))
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("get event")
}

async fn put_event(
    server: &TestServer,
    auth_header: &str,
    id: Uuid,
    payload: UpdateCarMaintenanceEventCommandDto,
) -> reqwest::Response {
    let url = server
        .server_url(&format!("{EVENTS_URL}/{id}"))
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .put(url)
        .header("Authorization", auth_header)
        .json(&payload)
        .send()
        .await
        .expect("put event")
}

async fn delete_event(server: &TestServer, auth_header: &str, id: Uuid) -> reqwest::Response {
    let url = server
        .server_url(&format!("{EVENTS_URL}/{id}"))
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .delete(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("delete event")
}

async fn list_events(
    server: &TestServer,
    auth_header: &str,
    car_id: Uuid,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    event_type: Option<&str>,
) -> Vec<CarMaintenanceEventDto> {
    let mut path = format!("{EVENTS_URL}?car_id={car_id}");
    if let Some(from) = from {
        path.push_str(&format!("&from={from}"));
    }
    if let Some(to) = to {
        path.push_str(&format!("&to={to}"));
    }
    if let Some(event_type) = event_type {
        path.push_str(&format!("&event_type={event_type}"));
    }
    let url = server.server_url(&path).expect("url").to_string();
    let res = reqwest::Client::new()
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("list");
    assert_eq!(res.status(), StatusCode::OK);
    res.json().await.expect("json")
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
