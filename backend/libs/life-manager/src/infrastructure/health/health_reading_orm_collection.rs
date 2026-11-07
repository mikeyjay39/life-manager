use std::sync::Arc;

use async_trait::async_trait;
use chrono::NaiveDate;
use deadpool_diesel::sqlite::Pool;
use diesel::{
    ExpressionMethods, OptionalExtension, QueryDsl, QueryResult, RunQueryDsl, SelectableHelper,
};
use uuid::Uuid;

use crate::{
    application::health_reading_repository::HealthReadingRepository,
    domain::{
        health_member::HealthMemberId,
        health_reading::{HealthReading, HealthReadingId},
    },
    infrastructure::health::health_reading_entity::{
        HealthReadingEntity, NewHealthReadingEntity, UpdateHealthReadingEntity,
    },
    schema::health_readings,
};

#[derive(Clone)]
pub struct HealthReadingOrmCollection {
    pub pool: Arc<Pool>,
}

impl HealthReadingOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl HealthReadingRepository for HealthReadingOrmCollection {
    async fn get_by_id(&self, id: &HealthReadingId) -> Option<HealthReading> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_by_id: {}", e);
                return None;
            }
        };

        let id_str = id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Option<HealthReadingEntity>> {
                health_readings::table
                    .filter(health_readings::id.eq(id_str))
                    .select(HealthReadingEntity::as_select())
                    .first(conn)
                    .optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error retrieving HealthReading {}: {}", id, e);
                None
            }
            Err(e) => {
                tracing::error!("Error retrieving HealthReading: {}", e);
                None
            }
        }
    }

    async fn list_by_member(
        &self,
        health_member_id: &HealthMemberId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
    ) -> Vec<HealthReading> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for list_by_member: {}", e);
                return vec![];
            }
        };

        let member_id_str = health_member_id.to_string();
        let user_id_str = user_id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Vec<HealthReadingEntity>> {
                let mut query = health_readings::table
                    .filter(health_readings::health_member_id.eq(member_id_str))
                    .filter(health_readings::user_id.eq(user_id_str))
                    .into_boxed();
                if let Some(from) = from {
                    query = query.filter(health_readings::recorded_on.ge(from));
                }
                if let Some(to) = to {
                    query = query.filter(health_readings::recorded_on.le(to));
                }
                query
                    .order((
                        health_readings::recorded_on.desc(),
                        health_readings::id.desc(),
                    ))
                    .select(HealthReadingEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(Ok(entities)) => entities.into_iter().filter_map(|e| e.into_domain()).collect(),
            Ok(Err(e)) => {
                tracing::error!("Database error listing HealthReadings: {}", e);
                vec![]
            }
            Err(e) => {
                tracing::error!("Error listing HealthReadings: {}", e);
                vec![]
            }
        }
    }

    async fn find_by_member_and_date(
        &self,
        health_member_id: &HealthMemberId,
        recorded_on: NaiveDate,
    ) -> Option<HealthReading> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for find_by_member_and_date: {}", e);
                return None;
            }
        };

        let member_id_str = health_member_id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Option<HealthReadingEntity>> {
                health_readings::table
                    .filter(health_readings::health_member_id.eq(member_id_str))
                    .filter(health_readings::recorded_on.eq(recorded_on))
                    .select(HealthReadingEntity::as_select())
                    .first(conn)
                    .optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error finding HealthReading by date: {}", e);
                None
            }
            Err(e) => {
                tracing::error!("Error finding HealthReading by date: {}", e);
                None
            }
        }
    }

    async fn save(
        &self,
        reading: HealthReading,
    ) -> Result<HealthReading, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let new_entity = NewHealthReadingEntity::from(&reading);
        let reading_id = reading.id;

        let result = conn
            .interact(move |conn| -> QueryResult<HealthReadingEntity> {
                diesel::insert_into(health_readings::table)
                    .values(&new_entity)
                    .returning(HealthReadingEntity::as_returning())
                    .get_result(conn)
            })
            .await;

        match result {
            Ok(Ok(entity)) => entity
                .into_domain()
                .ok_or_else(|| "Failed to map saved HealthReading".into()),
            Ok(Err(e)) => {
                tracing::error!("Error saving HealthReading {}: {}", reading_id, e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error saving HealthReading {}: {}", reading_id, e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(
        &self,
        reading: HealthReading,
    ) -> Result<HealthReading, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = reading.id.to_string();
        let update_entity = UpdateHealthReadingEntity::from(&reading);
        let reading_for_return = reading.clone();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::update(health_readings::table.filter(health_readings::id.eq(id_str)))
                    .set(&update_entity)
                    .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(reading_for_return),
            Ok(Ok(_)) => Err("HealthReading not found for update".into()),
            Ok(Err(e)) => {
                tracing::error!("Error updating HealthReading: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error updating HealthReading: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn delete(&self, id: &HealthReadingId) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = id.to_string();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::delete(health_readings::table.filter(health_readings::id.eq(id_str)))
                    .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(()),
            Ok(Ok(_)) => Err("HealthReading not found for delete".into()),
            Ok(Err(e)) => {
                tracing::error!("Error deleting HealthReading: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error deleting HealthReading: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn load_owned(&self, id: &HealthReadingId, user_id: &Uuid) -> Option<HealthReading> {
        let reading = self.get_by_id(id).await?;
        if reading.is_owned_by(user_id) {
            Some(reading)
        } else {
            tracing::warn!(
                "HealthReading {} is not owned by user {}. Access denied.",
                id,
                user_id
            );
            None
        }
    }
}
