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
    application::car::car_maintenance_event_repository::{
        CarMaintenanceEventRepository, InactiveCarForMaintenanceEvent,
        MissingCarForMaintenanceEvent, MissingCarMaintenanceEvent,
    },
    domain::{
        car::CarId,
        car::car_maintenance_event::{
            CarMaintenanceEvent, CarMaintenanceEventId, CarMaintenanceEventType,
        },
    },
    infrastructure::car::car_maintenance_event_entity::{
        CarMaintenanceEventEntity, NewCarMaintenanceEventEntity, UpdateCarMaintenanceEventEntity,
    },
    schema::{car_maintenance_events, cars},
};

/// Failure of a maintenance-event write on one connection (Diesel + domain
/// checks). It is `Send`, so it can leave a Diesel transaction inside `interact`.
pub(crate) enum MaintenanceEventWriteError {
    CarMissing,
    InactiveCar,
    EventMissing,
    Diesel(diesel::result::Error),
}

impl From<diesel::result::Error> for MaintenanceEventWriteError {
    fn from(value: diesel::result::Error) -> Self {
        Self::Diesel(value)
    }
}

impl MaintenanceEventWriteError {
    /// Maps to the repository errors that the maintenance commands downcast.
    pub(crate) fn into_repository_error(
        self,
        context: &str,
        event_id: CarMaintenanceEventId,
    ) -> Box<dyn std::error::Error> {
        match self {
            Self::CarMissing => Box::new(MissingCarForMaintenanceEvent),
            Self::InactiveCar => Box::new(InactiveCarForMaintenanceEvent),
            Self::EventMissing => Box::new(MissingCarMaintenanceEvent),
            Self::Diesel(e) => {
                tracing::error!("Error {} CarMaintenanceEvent {}: {}", context, event_id, e);
                Box::new(e)
            }
        }
    }
}

/// Checks that the car exists, has the same owner, and is active.
fn ensure_car_active(
    conn: &mut SqliteConnection,
    car_id: &str,
    user_id: &str,
) -> Result<(), MaintenanceEventWriteError> {
    let car_active: Option<bool> = cars::table
        .filter(cars::id.eq(car_id))
        .filter(cars::user_id.eq(user_id))
        .select(cars::active)
        .first(conn)
        .optional()?;
    match car_active {
        Some(true) => Ok(()),
        Some(false) => Err(MaintenanceEventWriteError::InactiveCar),
        None => Err(MaintenanceEventWriteError::CarMissing),
    }
}

/// Checks that the Car is active, then inserts the event, on `conn`.
///
/// Run it in an IMMEDIATE transaction: the write lock stops a concurrent
/// deactivate between the active check and the INSERT.
pub(crate) fn insert_maintenance_event(
    conn: &mut SqliteConnection,
    event: &CarMaintenanceEvent,
) -> Result<CarMaintenanceEvent, MaintenanceEventWriteError> {
    ensure_car_active(conn, &event.car_id.to_string(), &event.user_id.to_string())?;
    let entity = diesel::insert_into(car_maintenance_events::table)
        .values(&NewCarMaintenanceEventEntity::from(event))
        .returning(CarMaintenanceEventEntity::as_returning())
        .get_result(conn)?;
    entity.into_domain().ok_or(MaintenanceEventWriteError::Diesel(
        diesel::result::Error::DeserializationError(
            "Failed to map saved CarMaintenanceEvent".into(),
        ),
    ))
}

/// Updates one owned event row on `conn`. No active-car check: history
/// correction on inactive Cars is allowed. Zero rows (removed after load) is
/// `EventMissing`.
pub(crate) fn update_maintenance_event(
    conn: &mut SqliteConnection,
    event: &CarMaintenanceEvent,
) -> Result<(), MaintenanceEventWriteError> {
    let rows = diesel::update(
        car_maintenance_events::table
            .filter(car_maintenance_events::id.eq(event.id.to_string()))
            .filter(car_maintenance_events::user_id.eq(event.user_id.to_string())),
    )
    .set(&UpdateCarMaintenanceEventEntity::from(event))
    .execute(conn)?;
    if rows == 0 {
        return Err(MaintenanceEventWriteError::EventMissing);
    }
    Ok(())
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
        let event_id = event.id;

        let result = conn
            .interact(move |conn| {
                conn.immediate_transaction(|conn| insert_maintenance_event(conn, &event))
            })
            .await;

        match result {
            Ok(Ok(saved)) => Ok(saved),
            Ok(Err(e)) => Err(e.into_repository_error("saving", event_id)),
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
        let event_id = event.id;
        let event_for_update = event.clone();

        let result = conn
            .interact(move |conn| update_maintenance_event(conn, &event_for_update))
            .await;

        match result {
            Ok(Ok(())) => Ok(event),
            Ok(Err(e)) => Err(e.into_repository_error("updating", event_id)),
            Err(e) => {
                tracing::error!("Error updating CarMaintenanceEvent {}: {}", event_id, e);
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
