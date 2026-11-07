use std::sync::Arc;

use async_trait::async_trait;
use chrono::NaiveDate;
use deadpool_diesel::sqlite::Pool;
use diesel::{
    ExpressionMethods, OptionalExtension, QueryDsl, QueryResult, RunQueryDsl, SelectableHelper,
    SqliteConnection,
};
use uuid::Uuid;

use crate::{
    application::car_maintenance_event_repository::{
        CarMaintenanceEventRepository, InactiveCarForMaintenanceEvent,
        MissingCarForMaintenanceEvent, MissingCarMaintenanceEvent,
    },
    domain::{
        car::CarId,
        car_maintenance_event::{
            CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventType,
        },
    },
    infrastructure::car_maintenance_event::car_maintenance_event_entity::{
        CarMaintenanceEventEntity, NewCarMaintenanceEventEntity, UpdateCarMaintenanceEventEntity,
    },
    schema::{car_maintenance_events, cars},
};

/// Local failure for a write transaction (Diesel + domain checks).
enum WriteTxError {
    CarMissing,
    InactiveCar,
    Diesel(diesel::result::Error),
}

impl From<diesel::result::Error> for WriteTxError {
    fn from(value: diesel::result::Error) -> Self {
        Self::Diesel(value)
    }
}

/// Checks that the car exists, has the same owner, and is active.
fn ensure_car_active(
    conn: &mut SqliteConnection,
    car_id: &str,
    user_id: &str,
) -> Result<(), WriteTxError> {
    let car_active: Option<bool> = cars::table
        .filter(cars::id.eq(car_id))
        .filter(cars::user_id.eq(user_id))
        .select(cars::active)
        .first(conn)
        .optional()?;
    match car_active {
        Some(true) => Ok(()),
        Some(false) => Err(WriteTxError::InactiveCar),
        None => Err(WriteTxError::CarMissing),
    }
}

/// Maps a write transaction failure to a repository error.
fn map_write_error(
    context: &str,
    event_id: CarMaintenanceEventId,
    error: WriteTxError,
) -> Box<dyn std::error::Error> {
    match error {
        WriteTxError::CarMissing => Box::new(MissingCarForMaintenanceEvent),
        WriteTxError::InactiveCar => Box::new(InactiveCarForMaintenanceEvent),
        WriteTxError::Diesel(e) => {
            tracing::error!("Error {} CarMaintenanceEvent {}: {}", context, event_id, e);
            Box::new(e)
        }
    }
}

#[derive(Clone)]
pub struct CarMaintenanceEventOrmCollection {
    pub pool: Arc<Pool>,
}

impl CarMaintenanceEventOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl CarMaintenanceEventRepository for CarMaintenanceEventOrmCollection {
    async fn get_by_id(&self, id: &CarMaintenanceEventId) -> Option<CarMaintenanceEvent> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_by_id: {}", e);
                return None;
            }
        };

        let id_str = id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Option<CarMaintenanceEventEntity>> {
                car_maintenance_events::table
                    .filter(car_maintenance_events::id.eq(id_str))
                    .select(CarMaintenanceEventEntity::as_select())
                    .first(conn)
                    .optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error retrieving CarMaintenanceEvent {}: {}", id, e);
                None
            }
            Err(e) => {
                tracing::error!("Error retrieving CarMaintenanceEvent: {}", e);
                None
            }
        }
    }

    async fn list_by_car(
        &self,
        car_id: &CarId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
        event_type: Option<CarMaintenanceEventType>,
    ) -> Vec<CarMaintenanceEvent> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for list_by_car: {}", e);
                return vec![];
            }
        };

        let car_id_str = car_id.to_string();
        let user_id_str = user_id.to_string();
        let event_type_str = event_type.map(|ty| ty.as_str().to_string());
        let result = conn
            .interact(move |conn| -> QueryResult<Vec<CarMaintenanceEventEntity>> {
                let mut query = car_maintenance_events::table
                    .filter(car_maintenance_events::car_id.eq(car_id_str))
                    .filter(car_maintenance_events::user_id.eq(user_id_str))
                    .into_boxed();
                if let Some(from) = from {
                    query = query.filter(car_maintenance_events::occurred_on.ge(from));
                }
                if let Some(to) = to {
                    query = query.filter(car_maintenance_events::occurred_on.le(to));
                }
                if let Some(event_type) = event_type_str {
                    query = query.filter(car_maintenance_events::event_type.eq(event_type));
                }
                query
                    .order((
                        car_maintenance_events::occurred_on.desc(),
                        car_maintenance_events::created_at.desc(),
                        car_maintenance_events::id.desc(),
                    ))
                    .select(CarMaintenanceEventEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(Ok(entities)) => entities
                .into_iter()
                .filter_map(|e| e.into_domain())
                .collect(),
            Ok(Err(e)) => {
                tracing::error!("Database error listing CarMaintenanceEvents: {}", e);
                vec![]
            }
            Err(e) => {
                tracing::error!("Error listing CarMaintenanceEvents: {}", e);
                vec![]
            }
        }
    }

    async fn save(
        &self,
        event: CarMaintenanceEvent,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let new_entity = NewCarMaintenanceEventEntity::from(&event);
        let event_id = event.id;
        let car_id_str = event.car_id.to_string();
        let user_id_str = event.user_id.to_string();

        // Re-check active car in the same transaction as INSERT so a
        // concurrent deactivate cannot leave a new event on an inactive car.
        let result = conn
            .interact(move |conn| {
                // IMMEDIATE locks the DB writer so deactivate cannot interleave
                // between the active check and the INSERT.
                conn.immediate_transaction(|conn| {
                    ensure_car_active(conn, &car_id_str, &user_id_str)?;
                    diesel::insert_into(car_maintenance_events::table)
                        .values(&new_entity)
                        .returning(CarMaintenanceEventEntity::as_returning())
                        .get_result(conn)
                        .map_err(WriteTxError::from)
                })
            })
            .await;

        match result {
            Ok(Ok(entity)) => entity
                .into_domain()
                .ok_or_else(|| "Failed to map saved CarMaintenanceEvent".into()),
            Ok(Err(e)) => Err(map_write_error("saving", event_id, e)),
            Err(e) => {
                tracing::error!("Error saving CarMaintenanceEvent {}: {}", event_id, e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(
        &self,
        event: CarMaintenanceEvent,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = event.id.to_string();
        let user_id_str = event.user_id.to_string();
        let update_entity = UpdateCarMaintenanceEventEntity::from(&event);
        let event_for_return = event.clone();

        // No active-car check: history correction on inactive Cars is allowed.
        // Map 0 rows (removed after load) to MissingCarMaintenanceEvent.
        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::update(
                    car_maintenance_events::table
                        .filter(car_maintenance_events::id.eq(id_str))
                        .filter(car_maintenance_events::user_id.eq(user_id_str)),
                )
                .set(&update_entity)
                .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(event_for_return),
            Ok(Ok(_)) => Err(Box::new(MissingCarMaintenanceEvent)),
            Ok(Err(e)) => {
                tracing::error!("Error updating CarMaintenanceEvent: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error updating CarMaintenanceEvent: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn delete(
        &self,
        id: &CarMaintenanceEventId,
        user_id: &Uuid,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = id.to_string();
        let user_id_str = user_id.to_string();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::delete(
                    car_maintenance_events::table
                        .filter(car_maintenance_events::id.eq(id_str))
                        .filter(car_maintenance_events::user_id.eq(user_id_str)),
                )
                .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(()),
            Ok(Ok(_)) => Err(Box::new(MissingCarMaintenanceEvent)),
            Ok(Err(e)) => {
                tracing::error!("Error deleting CarMaintenanceEvent: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error deleting CarMaintenanceEvent: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn load_owned(
        &self,
        id: &CarMaintenanceEventId,
        user_id: &Uuid,
    ) -> Option<CarMaintenanceEvent> {
        let event = self.get_by_id(id).await?;
        if event.is_owned_by(user_id) {
            Some(event)
        } else {
            tracing::warn!(
                "CarMaintenanceEvent {} is not owned by user {}. Access denied.",
                id,
                user_id
            );
            None
        }
    }
}
