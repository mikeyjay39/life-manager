use std::{env, sync::Arc};

use chrono::Utc;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl};

use crate::{
    domain::{auth_password_hasher::AuthPasswordHasher, default_admin::ADMIN_USER_ID},
    infrastructure::{
        argon_password_hasher::ArgonPasswordHasher, auth_user_entity::NewAuthUserEntity,
    },
    schema::auth_users,
};

pub async fn ensure_default_admin_user(pool: &Arc<Pool>, tenant: &str) {
    let username = env::var("ADMIN_USERNAME").expect("ADMIN_USERNAME must be set");
    let password = env::var("ADMIN_PASSWORD").expect("ADMIN_PASSWORD must be set");

    let conn = pool
        .get()
        .await
        .expect("Failed to get database connection from pool");

    let username_check = username.clone();
    let already_exists = conn
        .interact(move |conn| {
            auth_users::table
                .filter(auth_users::username.eq(username_check))
                .select(auth_users::id)
                .first::<String>(conn)
                .optional()
        })
        .await
        .expect("Failed to check for default admin user")
        .expect("Database error checking for default admin user")
        .is_some();

    if already_exists {
        return;
    }

    let hasher = ArgonPasswordHasher;
    let new_user = NewAuthUserEntity {
        id: ADMIN_USER_ID.to_string(),
        username,
        password_hash: hasher.hash_password(&password),
        tenant: tenant.to_string(),
        active: true,
        created_at: Utc::now().naive_utc(),
    };

    conn.interact(move |conn| diesel::insert_into(auth_users::table).values(&new_user).execute(conn))
        .await
        .expect("Failed to seed default admin user")
        .expect("Failed to insert default admin user");
}
