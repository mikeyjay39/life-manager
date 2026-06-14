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
                    .select(AuthUserEntity::as_select())
                    .get_result(conn)
            })
            .await;

        return match result {
            Ok(r) => match r {
                Ok(entity) => Some(Box::new(entity)),
                Err(_) => {
                    tracing::warn!("No user found with ID: {}", username);
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
