use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};

use crate::{
    domain::principal::{Principal, PrincipalRepository},
    infrastructure::auth_user_entity::AuthUserEntity,
    schema::auth_users,
};

#[derive(Clone)]
pub struct PrincipalOrmCollection {
    pub pool: Arc<Pool>,
}

impl PrincipalOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl PrincipalRepository for PrincipalOrmCollection {
    async fn get_principal(&self, username: &str) -> Option<Box<dyn Principal>> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Failed to get database connection from pool: {}", e);
                return None;
            }
        };

        let username_for_query = username.to_string();
        let result = conn
            .interact(move |conn| {
                auth_users::table
                    .filter(auth_users::username.eq(username_for_query))
                    .filter(auth_users::active.eq(true))
                    .select(AuthUserEntity::as_select())
                    .get_result(conn)
            })
            .await;

        return match result {
            Ok(r) => match r {
                Ok(entity) => Some(Box::new(entity)),
                Err(_) => {
                    tracing::warn!("No active user found with username: {}", username);
                    None
                }
            },
            Err(e) => {
                tracing::error!("Database error: {}", e);
                None
            }
        };
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Once};

    use crate::{
        domain::principal::PrincipalRepository,
        infrastructure::{
            auth_user_seeder::ensure_default_admin_user,
            db::{fresh_test_pool, run_migrations},
            test_support::{insert_auth_user, set_user_active},
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

    #[tokio::test]
    async fn given_seeded_admin_when_getting_principal_then_returns_user() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref()).await;
        ensure_default_admin_user(&pool, "life-manager").await;
        let repository = PrincipalOrmCollection::new(pool);

        // When
        let principal = repository
            .get_principal("admin")
            .await
            .expect("Seeded admin should exist");

        // Then
        assert_eq!(principal.tenant(), "life-manager");
        assert!(!principal.password_hash().is_empty());
    }

    #[tokio::test]
    async fn given_unknown_username_when_getting_principal_then_returns_none() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref()).await;
        ensure_default_admin_user(&pool, "life-manager").await;
        let repository = PrincipalOrmCollection::new(pool);

        // When
        let principal = repository.get_principal("nobody").await;

        // Then
        assert!(principal.is_none());
    }

    #[tokio::test]
    async fn given_inactive_user_when_getting_principal_then_returns_none() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref()).await;
        insert_auth_user(&pool, "inactive", "password", "life-manager", false).await;
        let repository = PrincipalOrmCollection::new(pool);

        // When
        let principal = repository.get_principal("inactive").await;

        // Then
        assert!(principal.is_none());
    }

    #[tokio::test]
    async fn given_deactivated_admin_when_getting_principal_then_returns_none() {
        init_test_env();
        // Given
        let pool = fresh_test_pool();
        run_migrations(pool.as_ref()).await;
        ensure_default_admin_user(&pool, "life-manager").await;
        set_user_active(&pool, "admin", false).await;
        let repository = PrincipalOrmCollection::new(pool);

        // When
        let principal = repository.get_principal("admin").await;

        // Then
        assert!(principal.is_none());
    }
}
