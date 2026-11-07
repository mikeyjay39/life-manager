use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, QueryResult, RunQueryDsl, SelectableHelper};
use uuid::Uuid;

use crate::{
    application::health_member_repository::HealthMemberRepository,
    domain::health_member::{HealthMember, HealthMemberId},
    infrastructure::health_member::health_member_entity::{
        HealthMemberEntity, NewHealthMemberEntity, UpdateHealthMemberEntity,
    },
    schema::health_members,
};

#[derive(Clone)]
pub struct HealthMemberOrmCollection {
    pub pool: Arc<Pool>,
}

impl HealthMemberOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl HealthMemberRepository for HealthMemberOrmCollection {
    async fn get_by_id(&self, id: &HealthMemberId) -> Option<HealthMember> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_by_id: {}", e);
                return None;
            }
        };

        let id_str = id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Option<HealthMemberEntity>> {
                health_members::table
                    .filter(health_members::id.eq(id_str))
                    .select(HealthMemberEntity::as_select())
                    .first(conn)
                    .optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error retrieving HealthMember {}: {}", id, e);
                None
            }
            Err(e) => {
                tracing::error!("Error retrieving HealthMember: {}", e);
                None
            }
        }
    }

    async fn list_by_owner(&self, user_id: &Uuid, include_inactive: bool) -> Vec<HealthMember> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for list_by_owner: {}", e);
                return vec![];
            }
        };

        let user_id_str = user_id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Vec<HealthMemberEntity>> {
                let mut query = health_members::table
                    .filter(health_members::user_id.eq(user_id_str))
                    .into_boxed();
                if !include_inactive {
                    query = query.filter(health_members::active.eq(true));
                }
                query
                    .order((
                        health_members::display_name.asc(),
                        health_members::id.asc(),
                    ))
                    .select(HealthMemberEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(Ok(entities)) => entities.into_iter().filter_map(|e| e.into_domain()).collect(),
            Ok(Err(e)) => {
                tracing::error!("Database error listing HealthMembers: {}", e);
                vec![]
            }
            Err(e) => {
                tracing::error!("Error listing HealthMembers: {}", e);
                vec![]
            }
        }
    }

    async fn save(&self, member: HealthMember) -> Result<HealthMember, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let new_entity = NewHealthMemberEntity::from(&member);
        let member_id = member.id;

        let result = conn
            .interact(move |conn| -> QueryResult<HealthMemberEntity> {
                diesel::insert_into(health_members::table)
                    .values(&new_entity)
                    .returning(HealthMemberEntity::as_returning())
                    .get_result(conn)
            })
            .await;

        match result {
            Ok(Ok(entity)) => entity
                .into_domain()
                .ok_or_else(|| "Failed to map saved HealthMember".into()),
            Ok(Err(e)) => {
                tracing::error!("Error saving HealthMember {}: {}", member_id, e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error saving HealthMember {}: {}", member_id, e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(
        &self,
        member: HealthMember,
    ) -> Result<HealthMember, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = member.id.to_string();
        let update_entity = UpdateHealthMemberEntity::from(&member);
        let member_for_return = member.clone();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::update(health_members::table.filter(health_members::id.eq(id_str)))
                    .set(&update_entity)
                    .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(member_for_return),
            Ok(Ok(_)) => Err("HealthMember not found for update".into()),
            Ok(Err(e)) => {
                tracing::error!("Error updating HealthMember: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error updating HealthMember: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn load_owned(&self, id: &HealthMemberId, user_id: &Uuid) -> Option<HealthMember> {
        let member = self.get_by_id(id).await?;
        if member.is_owned_by(user_id) {
            Some(member)
        } else {
            tracing::warn!(
                "HealthMember {} is not owned by user {}. Access denied.",
                id,
                user_id
            );
            None
        }
    }
}
