#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use axum_test::TestServer;
use chrono::NaiveDate;
use life_manager::infrastructure::health::health_reading_api_types::CreateHealthReadingCommandDto;
use life_manager::infrastructure::health::health_reading_dto::HealthReadingDto;
use life_manager::infrastructure::health_member::health_member_api_types::CreateHealthMemberCommandDto;
use life_manager::infrastructure::health_member::health_member_dto::HealthMemberDto;
use reqwest::StatusCode;
use serial_test::serial;
use tracing_test::traced_test;
use uuid::Uuid;

use crate::common::setup::{
    build_auth_header, build_bearer_token_with_tenant, run_test_with_test_profile,
};

const HEALTH_MEMBERS_URL: &str = "/life-manager/api/v1/health-members";
const HEALTH_READINGS_URL: &str = "/life-manager/api/v1/health-readings";

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_active_member_when_create_reading_then_201_with_dto() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        let res = post_reading(
            &server,
            &auth_header,
            metric_payload(member.id, day),
        )
        .await;

        assert_eq!(res.status(), StatusCode::CREATED);
        let created = res.json::<HealthReadingDto>().await.expect("json");
        assert_eq!(created.health_member_id, member.id);
        assert_eq!(created.recorded_on, day);
        assert_eq!(created.height_cm, Some(180.0));
        assert!(created.bmi.is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_inactive_member_when_create_reading_then_400_and_nothing_stored() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        deactivate_member(&server, &auth_header, member.id).await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        let res = post_reading(
            &server,
            &auth_header,
            metric_payload(member.id, day),
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let empty = list_readings(&server, &auth_header, member.id, None, None).await;
        assert!(empty.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_member_when_create_reading_then_404_and_nothing_stored() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        let res = post_reading(
            &server,
            &other_header,
            metric_payload(member.id, day),
        )
        .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);

        let list = list_readings(&server, &auth_header, member.id, None, None).await;
        assert!(list.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_auth_when_create_reading_then_401() {
    run_test_with_test_profile(|server: TestServer| async move {
        let url = server
            .server_url(HEALTH_READINGS_URL)
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .post(url)
            .json(&metric_payload(Uuid::new_v4(), NaiveDate::from_ymd_opt(2026, 1, 15).unwrap()))
            .send()
            .await
            .expect("request");
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_readings_for_two_members_when_list_by_one_then_only_that_member() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let m1 = create_member(&server, &auth_header, "One").await;
        let m2 = create_member(&server, &auth_header, "Two").await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 11).unwrap();

        post_reading(&server, &auth_header, metric_payload(m1.id, d1))
            .await
            .error_for_status()
            .expect("m1");
        post_reading(&server, &auth_header, metric_payload(m2.id, d2))
            .await
            .error_for_status()
            .expect("m2");

        let list = list_readings(&server, &auth_header, m1.id, None, None).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].health_member_id, m1.id);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_duplicate_date_when_create_then_400_and_existing_unchanged() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let day = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();

        let first_res = post_reading(
            &server,
            &auth_header,
            metric_payload(member.id, day),
        )
        .await;
        assert_eq!(first_res.status(), StatusCode::CREATED);
        let first = first_res.json::<HealthReadingDto>().await.expect("json");

        let dup = CreateHealthReadingCommandDto {
            health_member_id: member.id,
            recorded_on: day,
            height_cm: Some(170.0),
            weight_kg: Some(70.0),
            systolic_mm_hg: None,
            diastolic_mm_hg: None,
            heart_rate_bpm: None,
            notes: None,
        };
        let second = post_reading(&server, &auth_header, dup).await;
        assert_eq!(second.status(), StatusCode::BAD_REQUEST);

        let list = list_readings(&server, &auth_header, member.id, None, None).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, first.id);
        assert_eq!(list[0].height_cm, Some(180.0));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_several_dates_when_list_with_from_to_then_inclusive_range() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let d1 = NaiveDate::from_ymd_opt(2026, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let d3 = NaiveDate::from_ymd_opt(2026, 1, 20).unwrap();

        for day in [d1, d2, d3] {
            post_reading(&server, &auth_header, metric_payload(member.id, day))
                .await
                .error_for_status()
                .expect("create");
        }

        let list = list_readings(&server, &auth_header, member.id, Some(d1), Some(d2)).await;
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].recorded_on, d2);
        assert_eq!(list[1].recorded_on, d1);
    })
    .await;
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

async fn create_member(
    server: &TestServer,
    auth_header: &str,
    display_name: &str,
) -> HealthMemberDto {
    let url = server
        .server_url(HEALTH_MEMBERS_URL)
        .expect("url")
        .to_string();
    let res = reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .json(&CreateHealthMemberCommandDto {
            display_name: display_name.to_string(),
            birth_date: None,
            notes: None,
        })
        .send()
        .await
        .expect("create");
    assert_eq!(res.status(), StatusCode::CREATED);
    res.json().await.expect("json")
}

async fn deactivate_member(server: &TestServer, auth_header: &str, id: Uuid) {
    let url = server
        .server_url(&format!("{HEALTH_MEMBERS_URL}/{id}/deactivate"))
        .expect("url")
        .to_string();
    let res = reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("deactivate");
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::NO_CONTENT);
}

async fn post_reading(
    server: &TestServer,
    auth_header: &str,
    payload: CreateHealthReadingCommandDto,
) -> reqwest::Response {
    let url = server
        .server_url(HEALTH_READINGS_URL)
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .json(&payload)
        .send()
        .await
        .expect("post reading")
}

async fn list_readings(
    server: &TestServer,
    auth_header: &str,
    health_member_id: Uuid,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> Vec<HealthReadingDto> {
    let mut path = format!("{HEALTH_READINGS_URL}?health_member_id={health_member_id}");
    if let Some(from) = from {
        path.push_str(&format!("&from={from}"));
    }
    if let Some(to) = to {
        path.push_str(&format!("&to={to}"));
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
