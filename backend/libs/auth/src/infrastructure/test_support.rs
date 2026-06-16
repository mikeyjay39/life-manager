//! Helpers for integration tests in `backend/tests/`. Not used in production handlers.

use std::sync::Arc;

use chrono::Utc;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
use uuid::Uuid;

use crate::{
    domain::auth_password_hasher::AuthPasswordHasher,
    infrastructure::{
        argon_password_hasher::ArgonPasswordHasher, auth_user_entity::NewAuthUserEntity,
    },
    schema::auth_users,
};

pub async fn insert_auth_user(
    pool: &Arc<Pool>,
    username: &str,
    password: &str,
    tenant: &str,
    active: bool,
) -> Uuid {
    let user_id = Uuid::new_v4();
    let hasher = ArgonPasswordHasher;
    let new_user = NewAuthUserEntity {
        id: user_id.to_string(),
        username: username.to_string(),
        password_hash: hasher.hash_password(password),
        tenant: tenant.to_string(),
        active,
        created_at: Utc::now().naive_utc(),
    };

    let conn = pool
        .get()
        .await
        .expect("Failed to get database connection from pool");
    conn.interact(move |conn| diesel::insert_into(auth_users::table).values(&new_user).execute(conn))
        .await
        .expect("Failed to insert auth user")
        .expect("Database error inserting auth user");

    user_id
}

pub async fn set_user_active(pool: &Arc<Pool>, username: &str, active: bool) {
    let username = username.to_string();
    let conn = pool
        .get()
        .await
        .expect("Failed to get database connection from pool");
    conn.interact(move |conn| {
        diesel::update(auth_users::table.filter(auth_users::username.eq(username)))
            .set(auth_users::active.eq(active))
            .execute(conn)
    })
    .await
    .expect("Failed to update auth user active flag")
    .expect("Database error updating auth user active flag");
}
