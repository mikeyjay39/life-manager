use std::{env, sync::Arc};

use chrono::Utc;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl};
use uuid::Uuid;

use crate::{
    domain::auth_password_hasher::AuthPasswordHasher,
    infrastructure::{
        argon_password_hasher::ArgonPasswordHasher, auth_user_entity::NewAuthUserEntity,
    },
    schema::auth_users,
};

const ADMIN_USER_ID: &str = "00000000-0000-0000-0000-000000000001";

pub fn admin_user_uuid() -> Uuid {
    Uuid::parse_str(ADMIN_USER_ID).expect("Invalid ADMIN_USER_ID format")
}

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
        id: admin_user_uuid().to_string(),
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

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Once};

    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};

    use crate::{
        domain::auth_password_hasher::AuthPasswordHasher,
        infrastructure::{
            argon_password_hasher::ArgonPasswordHasher,
            auth_user_entity::AuthUserEntity,
            db::{fresh_test_pool, run_migrations},
        },
    };

    use super::*;

    fn init_test_env() {
        static INIT: Once = Once::new();
        INIT.call_once(|| unsafe {
            std::env::set_var("ADMIN_USERNAME", "admin");
            std::env::set_var("ADMIN_PASSWORD", "password");
        });
    }

    async fn count_users(pool: &Arc<Pool>) -> i64 {
        let conn = pool.get().await.expect("Failed to get DB connection");
        conn.interact(|conn| auth_users::table.count().get_result(conn))
            .await
            .expect("Failed to count auth users")
            .expect("Database error counting auth users")
    }

    async fn find_user_by_username(pool: &Arc<Pool>, username: &str) -> AuthUserEntity {
        let username = username.to_string();
        let conn = pool.get().await.expect("Failed to get DB connection");
        conn.interact(move |conn| {
            auth_users::table
                .filter(auth_users::username.eq(username))
                .select(AuthUserEntity::as_select())
                .get_result(conn)
        })
        .await
        .expect("Failed to load auth user")
        .expect("Auth user should exist")
    }

    #[tokio::test]
    async fn given_empty_database_when_seeding_admin_then_inserts_expected_user() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref()).await;

        // When
        ensure_default_admin_user(&pool, "life-manager").await;

        // Then
        let user = find_user_by_username(&pool, "admin").await;
        assert_eq!(user.id, admin_user_uuid().to_string());
        assert_eq!(user.tenant, "life-manager");
        assert!(user.active);
        assert!(ArgonPasswordHasher.verify_password("password", &user.password_hash));
    }

    #[tokio::test]
    async fn given_existing_admin_when_seeding_again_then_is_idempotent() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref()).await;
        ensure_default_admin_user(&pool, "life-manager").await;

        // When
        ensure_default_admin_user(&pool, "life-manager").await;

        // Then
        assert_eq!(count_users(&pool).await, 1);
    }
}
