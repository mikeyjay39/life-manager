#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use axum_test::TestServer;
use life_manager::infrastructure::health_member::health_member_api_types::{
    CreateHealthMemberCommandDto, UpdateHealthMemberCommandDto,
};
use life_manager::infrastructure::health_member::health_member_dto::HealthMemberDto;
use reqwest::StatusCode;
use serial_test::serial;
use tracing_test::traced_test;

use crate::common::setup::{
    build_auth_header, build_bearer_token_with_tenant, run_test_with_test_profile,
};

const HEALTH_MEMBERS_URL: &str = "/life-manager/api/v1/health-members";

#[tokio::test]
#[serial]
#[traced_test]
async fn given_valid_jwt_when_create_health_member_then_201_active_owned() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let payload = CreateHealthMemberCommandDto {
            display_name: "Alex".to_string(),
            birth_date: None,
            notes: None,
        };

        let url = server
            .server_url(HEALTH_MEMBERS_URL)
            .expect("server url")
            .to_string();
        let res = reqwest::Client::new()
            .post(&url)
            .header("Authorization", &auth_header)
            .json(&payload)
            .send()
            .await
            .expect("create request");

        assert_eq!(res.status(), StatusCode::CREATED);
        let created = res.json::<HealthMemberDto>().await.expect("json");
        assert_eq!(created.display_name, "Alex");
        assert!(created.active);
        assert!(created.deactivated_at.is_none());

        let get_url = server
            .server_url(&format!("{}/{}", HEALTH_MEMBERS_URL, created.id))
            .expect("get url")
            .to_string();
        let get_res = reqwest::Client::new()
            .get(get_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("get request");
        assert_eq!(get_res.status(), StatusCode::OK);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_owned_member_when_put_new_display_name_then_200_updated() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_member(&server, &auth_header, "Alex").await;

        let url = server
            .server_url(&format!("{}/{}", HEALTH_MEMBERS_URL, created.id))
            .expect("url")
            .to_string();
        let update = UpdateHealthMemberCommandDto {
            display_name: "Alexandra".to_string(),
            birth_date: None,
            notes: Some("note".to_string()),
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
        let updated = res.json::<HealthMemberDto>().await.expect("json");
        assert_eq!(updated.display_name, "Alexandra");
        assert_eq!(updated.notes.as_deref(), Some("note"));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_active_member_when_deactivate_then_inactive_row_remains_get_works() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_member(&server, &auth_header, "Alex").await;

        let deactivate_url = server
            .server_url(&format!("{}/{}/deactivate", HEALTH_MEMBERS_URL, created.id))
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .post(deactivate_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("deactivate");
        assert!(res.status() == StatusCode::OK || res.status() == StatusCode::NO_CONTENT);
        if res.status() == StatusCode::OK {
            let body = res.json::<HealthMemberDto>().await.expect("json");
            assert!(!body.active);
        }

        let get_url = server
            .server_url(&format!("{}/{}", HEALTH_MEMBERS_URL, created.id))
            .expect("get url")
            .to_string();
        let get_res = reqwest::Client::new()
            .get(get_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("get");
        assert_eq!(get_res.status(), StatusCode::OK);
        let got = get_res.json::<HealthMemberDto>().await.expect("json");
        assert!(!got.active);
        assert!(got.deactivated_at.is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_active_and_inactive_when_list_default_then_only_active() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let active = create_member(&server, &auth_header, "Active One").await;
        let inactive = create_member(&server, &auth_header, "Inactive One").await;
        deactivate_member(&server, &auth_header, inactive.id).await;

        let url = server
            .server_url(HEALTH_MEMBERS_URL)
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("list");
        assert_eq!(res.status(), StatusCode::OK);
        let list = res.json::<Vec<HealthMemberDto>>().await.expect("json");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, active.id);
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_active_and_inactive_when_list_include_inactive_then_both() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let active = create_member(&server, &auth_header, "Active One").await;
        let inactive = create_member(&server, &auth_header, "Inactive One").await;
        deactivate_member(&server, &auth_header, inactive.id).await;

        let url = server
            .server_url(&format!("{HEALTH_MEMBERS_URL}?include_inactive=true"))
            .expect("url")
            .to_string();
        let res = reqwest::Client::new()
            .get(url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .expect("list");
        assert_eq!(res.status(), StatusCode::OK);
        let list = res.json::<Vec<HealthMemberDto>>().await.expect("json");
        assert_eq!(list.len(), 2);
        let ids: Vec<_> = list.iter().map(|m| m.id).collect();
        assert!(ids.contains(&active.id));
        assert!(ids.contains(&inactive.id));
    })
    .await;
}

#[tokio::test]
#[serial]
#[traced_test]
async fn given_other_users_member_when_update_or_deactivate_then_404() {
    run_test_with_test_profile(|server: TestServer| async move {
        let auth_header = build_auth_header(&server).await;
        let created = create_member(&server, &auth_header, "Alex").await;
        let other_header = build_bearer_token_with_tenant(uuid::Uuid::new_v4(), "life-manager");

        let update_url = server
            .server_url(&format!("{}/{}", HEALTH_MEMBERS_URL, created.id))
            .expect("url")
            .to_string();
        let update_res = reqwest::Client::new()
            .put(&update_url)
            .header("Authorization", &other_header)
            .json(&UpdateHealthMemberCommandDto {
                display_name: "Hacked".to_string(),
                birth_date: None,
                notes: None,
                active: None,
            })
            .send()
            .await
            .expect("update");
        assert_eq!(update_res.status(), StatusCode::NOT_FOUND);

        let deactivate_url = server
            .server_url(&format!("{}/{}/deactivate", HEALTH_MEMBERS_URL, created.id))
            .expect("url")
            .to_string();
        let deactivate_res = reqwest::Client::new()
            .post(deactivate_url)
            .header("Authorization", &other_header)
            .send()
            .await
            .expect("deactivate");
        assert_eq!(deactivate_res.status(), StatusCode::NOT_FOUND);
    })
    .await;
}

async fn create_member(server: &TestServer, auth_header: &str, display_name: &str) -> HealthMemberDto {
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

async fn deactivate_member(server: &TestServer, auth_header: &str, id: uuid::Uuid) {
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
