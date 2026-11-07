#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use axum_test::TestServer;
use chrono::{NaiveDate, Utc};
use life_manager::infrastructure::doctor_visit::doctor_visit_api_types::{
    CreateDoctorVisitCommandDto, UpdateDoctorVisitCommandDto,
};
use life_manager::infrastructure::doctor_visit::doctor_visit_dto::DoctorVisitDto;
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
const DOCTOR_VISITS_URL: &str = "/life-manager/api/v1/doctor-visits";

fn day(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_active_member_when_create_visit_then_201_with_dto() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let visited_on = day(2026, 1, 15);

        let res = post_visit(&server, &auth_header, visit_payload(member.id, visited_on)).await;

        assert_eq!(res.status(), StatusCode::CREATED);
        let created = res.json::<DoctorVisitDto>().await.expect("json");
        assert_eq!(created.health_member_id, member.id);
        assert_eq!(created.visited_on, visited_on);
        assert_eq!(created.provider_name.as_deref(), Some("Dr. Lee"));
        assert_eq!(created.reason.as_deref(), Some("Checkup"));
        assert!(created.notes.is_none());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_blank_fields_with_one_set_when_create_then_blank_stored_as_null() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;

        let res = post_visit(
            &server,
            &auth_header,
            CreateDoctorVisitCommandDto {
                health_member_id: member.id,
                visited_on: day(2026, 1, 15),
                provider_name: Some("   ".to_string()),
                reason: Some("  Flu  ".to_string()),
                notes: Some("".to_string()),
            },
        )
        .await;

        assert_eq!(res.status(), StatusCode::CREATED);
        let created = res.json::<DoctorVisitDto>().await.expect("json");
        assert!(created.provider_name.is_none());
        assert_eq!(created.reason.as_deref(), Some("Flu"));
        assert!(created.notes.is_none());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_text_fields_when_create_then_400_and_nothing_stored() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;

        let res = post_visit(
            &server,
            &auth_header,
            CreateDoctorVisitCommandDto {
                health_member_id: member.id,
                visited_on: day(2026, 1, 15),
                provider_name: Some("  ".to_string()),
                reason: None,
                notes: Some("\n".to_string()),
            },
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert!(list.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_future_date_when_create_then_400_and_nothing_stored() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);

        let res = post_visit(&server, &auth_header, visit_payload(member.id, tomorrow)).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert!(list.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_inactive_member_when_create_visit_then_400_and_nothing_stored() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        deactivate_member(&server, &auth_header, member.id).await;

        let res = post_visit(
            &server,
            &auth_header,
            visit_payload(member.id, day(2026, 1, 15)),
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert!(list.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_member_when_create_visit_then_404_and_nothing_stored() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");

        let res = post_visit(
            &server,
            &other_header,
            visit_payload(member.id, day(2026, 1, 15)),
        )
        .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert!(list.is_empty());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_no_auth_when_call_endpoints_then_401() {
    run_test_with_test_profile(|server: TestServer| async move {
        let client = reqwest::Client::new();
        let base = server
            .server_url(DOCTOR_VISITS_URL)
            .expect("url")
            .to_string();
        let item = format!("{base}/{}", Uuid::new_v4());

        let post = client
            .post(&base)
            .json(&visit_payload(Uuid::new_v4(), day(2026, 1, 15)))
            .send()
            .await
            .expect("post");
        assert_eq!(post.status(), StatusCode::UNAUTHORIZED);

        let list = client
            .get(format!("{base}?health_member_id={}", Uuid::new_v4()))
            .send()
            .await
            .expect("list");
        assert_eq!(list.status(), StatusCode::UNAUTHORIZED);

        let get = client.get(&item).send().await.expect("get");
        assert_eq!(get.status(), StatusCode::UNAUTHORIZED);

        let put = client
            .put(&item)
            .json(&update_payload(day(2026, 1, 15)))
            .send()
            .await
            .expect("put");
        assert_eq!(put.status(), StatusCode::UNAUTHORIZED);

        let del = client.delete(&item).send().await.expect("delete");
        assert_eq!(del.status(), StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_two_visits_same_day_when_create_then_both_201_and_listed() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let visited_on = day(2026, 1, 15);

        let first = post_visit(&server, &auth_header, visit_payload(member.id, visited_on)).await;
        assert_eq!(first.status(), StatusCode::CREATED);
        let second = post_visit(&server, &auth_header, visit_payload(member.id, visited_on)).await;
        assert_eq!(second.status(), StatusCode::CREATED);
        let a = first.json::<DoctorVisitDto>().await.expect("json");
        let b = second.json::<DoctorVisitDto>().await.expect("json");
        assert_ne!(a.id, b.id);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert_eq!(list.len(), 2);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_visits_for_two_members_when_list_by_one_then_only_that_member() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let m1 = create_member(&server, &auth_header, "One").await;
        let m2 = create_member(&server, &auth_header, "Two").await;

        post_visit(
            &server,
            &auth_header,
            visit_payload(m1.id, day(2026, 1, 10)),
        )
        .await
        .error_for_status()
        .expect("m1");
        post_visit(
            &server,
            &auth_header,
            visit_payload(m2.id, day(2026, 1, 11)),
        )
        .await
        .error_for_status()
        .expect("m2");

        let list = list_visits(&server, &auth_header, m1.id, None, None).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].health_member_id, m1.id);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_several_dates_when_list_with_from_to_then_inclusive_newest_first() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let d1 = day(2026, 1, 10);
        let d2 = day(2026, 1, 15);
        let d3 = day(2026, 1, 20);

        for d in [d1, d2, d3] {
            post_visit(&server, &auth_header, visit_payload(member.id, d))
                .await
                .error_for_status()
                .expect("create");
        }

        let all = list_visits(&server, &auth_header, member.id, None, None).await;
        let dates: Vec<NaiveDate> = all.iter().map(|v| v.visited_on).collect();
        assert_eq!(dates, vec![d3, d2, d1]);

        let range = list_visits(&server, &auth_header, member.id, Some(d1), Some(d2)).await;
        assert_eq!(range.len(), 2);
        assert_eq!(range[0].visited_on, d2);
        assert_eq!(range[1].visited_on, d1);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_missing_health_member_id_when_list_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let url = server
            .server_url(DOCTOR_VISITS_URL)
            .expect("url")
            .to_string();

        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", auth_header)
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
async fn given_from_after_to_when_list_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let path = format!(
            "{DOCTOR_VISITS_URL}?health_member_id={}&from=2026-02-01&to=2026-01-01",
            member.id
        );
        let url = server.server_url(&path).expect("url").to_string();

        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", auth_header)
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
async fn given_other_users_member_when_list_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");
        let path = format!("{DOCTOR_VISITS_URL}?health_member_id={}", member.id);
        let url = server.server_url(&path).expect("url").to_string();

        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", other_header)
            .send()
            .await
            .expect("list");
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_visit_when_get_by_id_then_200_and_other_user_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;

        let res = get_visit(&server, &auth_header, created.id).await;
        assert_eq!(res.status(), StatusCode::OK);
        let got = res.json::<DoctorVisitDto>().await.expect("json");
        assert_eq!(got.id, created.id);
        assert_eq!(got.provider_name.as_deref(), Some("Dr. Lee"));

        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");
        let other = get_visit(&server, &other_header, created.id).await;
        assert_eq!(other.status(), StatusCode::NOT_FOUND);

        let missing = get_visit(&server, &auth_header, Uuid::new_v4()).await;
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_visit_when_update_then_200_and_list_reflects() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;

        let res = put_visit(
            &server,
            &auth_header,
            created.id,
            UpdateDoctorVisitCommandDto {
                visited_on: day(2026, 1, 16),
                provider_name: Some("Dr. Kim".to_string()),
                reason: None,
                notes: Some("Follow up".to_string()),
            },
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let updated = res.json::<DoctorVisitDto>().await.expect("json");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.health_member_id, member.id);
        assert_eq!(updated.visited_on, day(2026, 1, 16));
        assert_eq!(updated.provider_name.as_deref(), Some("Dr. Kim"));
        assert!(updated.reason.is_none());
        assert_eq!(updated.notes.as_deref(), Some("Follow up"));

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0], updated);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_update_clears_all_text_when_put_then_400_and_unchanged() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;

        let res = put_visit(
            &server,
            &auth_header,
            created.id,
            UpdateDoctorVisitCommandDto {
                visited_on: day(2026, 1, 15),
                provider_name: Some(" ".to_string()),
                reason: None,
                notes: None,
            },
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let got = get_visit(&server, &auth_header, created.id)
            .await
            .json::<DoctorVisitDto>()
            .await
            .expect("json");
        assert_eq!(got.provider_name.as_deref(), Some("Dr. Lee"));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_future_date_when_update_then_400() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;
        let tomorrow = Utc::now().date_naive() + chrono::Duration::days(1);

        let res = put_visit(&server, &auth_header, created.id, update_payload(tomorrow)).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_member_deactivated_when_update_visit_then_400_and_unchanged() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;
        deactivate_member(&server, &auth_header, member.id).await;

        let res = put_visit(
            &server,
            &auth_header,
            created.id,
            update_payload(day(2026, 1, 16)),
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let got = get_visit(&server, &auth_header, created.id)
            .await
            .json::<DoctorVisitDto>()
            .await
            .expect("json");
        assert_eq!(got.visited_on, day(2026, 1, 15));
        assert_eq!(got.provider_name.as_deref(), Some("Dr. Lee"));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_member_deactivated_when_get_or_delete_visit_then_allowed() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;
        deactivate_member(&server, &auth_header, member.id).await;

        let got = get_visit(&server, &auth_header, created.id).await;
        assert_eq!(got.status(), StatusCode::OK);

        let del = delete_visit(&server, &auth_header, created.id).await;
        assert_eq!(del.status(), StatusCode::NO_CONTENT);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_visit_when_update_or_delete_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;
        let other_header = build_bearer_token_with_tenant(Uuid::new_v4(), "life-manager");

        let put = put_visit(
            &server,
            &other_header,
            created.id,
            update_payload(day(2026, 1, 16)),
        )
        .await;
        assert_eq!(put.status(), StatusCode::NOT_FOUND);

        let del = delete_visit(&server, &other_header, created.id).await;
        assert_eq!(del.status(), StatusCode::NOT_FOUND);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0], created);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_visit_when_delete_then_204_and_second_delete_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let member = create_member(&server, &auth_header, "Alex").await;
        let created = create_visit(&server, &auth_header, member.id, day(2026, 1, 15)).await;

        let first = delete_visit(&server, &auth_header, created.id).await;
        assert_eq!(first.status(), StatusCode::NO_CONTENT);

        let list = list_visits(&server, &auth_header, member.id, None, None).await;
        assert!(list.is_empty());

        let second = delete_visit(&server, &auth_header, created.id).await;
        assert_eq!(second.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

fn visit_payload(health_member_id: Uuid, visited_on: NaiveDate) -> CreateDoctorVisitCommandDto {
    CreateDoctorVisitCommandDto {
        health_member_id,
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

async fn post_visit(
    server: &TestServer,
    auth_header: &str,
    payload: CreateDoctorVisitCommandDto,
) -> reqwest::Response {
    let url = server
        .server_url(DOCTOR_VISITS_URL)
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .post(url)
        .header("Authorization", auth_header)
        .json(&payload)
        .send()
        .await
        .expect("post visit")
}

async fn create_visit(
    server: &TestServer,
    auth_header: &str,
    health_member_id: Uuid,
    visited_on: NaiveDate,
) -> DoctorVisitDto {
    let res = post_visit(
        server,
        auth_header,
        visit_payload(health_member_id, visited_on),
    )
    .await;
    assert_eq!(res.status(), StatusCode::CREATED);
    res.json().await.expect("json")
}

async fn get_visit(server: &TestServer, auth_header: &str, id: Uuid) -> reqwest::Response {
    let url = server
        .server_url(&format!("{DOCTOR_VISITS_URL}/{id}"))
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("get visit")
}

async fn put_visit(
    server: &TestServer,
    auth_header: &str,
    id: Uuid,
    payload: UpdateDoctorVisitCommandDto,
) -> reqwest::Response {
    let url = server
        .server_url(&format!("{DOCTOR_VISITS_URL}/{id}"))
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .put(url)
        .header("Authorization", auth_header)
        .json(&payload)
        .send()
        .await
        .expect("put visit")
}

async fn delete_visit(server: &TestServer, auth_header: &str, id: Uuid) -> reqwest::Response {
    let url = server
        .server_url(&format!("{DOCTOR_VISITS_URL}/{id}"))
        .expect("url")
        .to_string();
    reqwest::Client::new()
        .delete(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .expect("delete visit")
}

async fn list_visits(
    server: &TestServer,
    auth_header: &str,
    health_member_id: Uuid,
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
) -> Vec<DoctorVisitDto> {
    let mut path = format!("{DOCTOR_VISITS_URL}?health_member_id={health_member_id}");
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
