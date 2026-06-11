use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use uuid::Uuid;

use crate::{
    AuthUser,
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
    async fn get_principal(&self, user_id: &Uuid) -> Option<Box<dyn Principal>> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Failed to get database connection from pool: {}", e);
                return None;
            }
        };

        let user_id_str = user_id.to_string();

        let result = conn
            .interact(move |conn| {
                auth_users::table
                    .filter(auth_users::id.eq(user_id_str))
                    .select(AuthUserEntity::as_select())
                    .get_result(conn)
            })
            .await;

        return match result {
            Ok(r) => match r {
                Ok(entity) => {
                    let user_id = match Uuid::parse_str(&entity.id) {
                        Ok(uuid) => uuid,
                        Err(e) => {
                            tracing::error!("Failed to parse user_id as string from uuid.: {}", e);
                            return None;
                        }
                    };
                    Some(Box::new(AuthUser {
                        user_id,
                        tenant: entity.tenant,
                    }))
                }
                Err(_) => {
                    tracing::warn!("No user found with ID: {}", user_id);
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
