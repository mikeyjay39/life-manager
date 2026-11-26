use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;
use diesel::{
    ExpressionMethods, OptionalExtension, QueryDsl, QueryResult, RunQueryDsl, SelectableHelper,
    SqliteConnection,
};
use uuid::Uuid;

use crate::{
    application::car::car_repository::{
        CarRepository, DuplicateCarLicensePlate, DuplicateCarVin, MissingCar,
    },
    domain::car::{Car, CarId},
    infrastructure::car::car_entity::{CarEntity, NewCarEntity, UpdateCarEntity},
    schema::cars,
};

#[derive(Clone)]
pub struct CarOrmCollection {
    pub pool: Arc<Pool>,
}

impl CarOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

/// Failure of a Car write on one connection. It is `Send`, so it can leave a
/// Diesel transaction inside `interact`.
pub(crate) enum CarWriteError {
    DuplicateVin,
    DuplicateLicensePlate,
    MissingCar,
    Diesel(diesel::result::Error),
}

impl From<diesel::result::Error> for CarWriteError {
    fn from(err: diesel::result::Error) -> Self {
        let diesel::result::Error::DatabaseError(
            diesel::result::DatabaseErrorKind::UniqueViolation,
            _,
        ) = &err
        else {
            return Self::Diesel(err);
        };
        let msg = err.to_string().to_lowercase();
        if msg.contains("license_plate") {
            Self::DuplicateLicensePlate
        } else if msg.contains("vin") {
            Self::DuplicateVin
        } else {
            Self::Diesel(err)
        }
    }
}

impl CarWriteError {
    /// Maps to the repository errors that the Car commands downcast.
    pub(crate) fn into_repository_error(self, context: &str) -> Box<dyn std::error::Error> {
        match self {
            Self::DuplicateVin => Box::new(DuplicateCarVin),
            Self::DuplicateLicensePlate => Box::new(DuplicateCarLicensePlate),
            Self::MissingCar => Box::new(MissingCar),
            Self::Diesel(e) => {
                tracing::error!("Error {} Car: {}", context, e);
                Box::new(e)
            }
        }
    }
}

/// Inserts one Car row on `conn`. The unique indexes map to duplicate errors.
pub(super) fn insert_car(conn: &mut SqliteConnection, car: &Car) -> Result<Car, CarWriteError> {
    let entity = diesel::insert_into(cars::table)
        .values(&NewCarEntity::from(car))
        .returning(CarEntity::as_returning())
        .get_result(conn)?;
    entity.into_domain().ok_or(CarWriteError::Diesel(
        diesel::result::Error::DeserializationError("Failed to map saved Car".into()),
    ))
}

/// Updates one Car row on `conn`. Zero rows (removed after load) is `MissingCar`.
pub(super) fn update_car(conn: &mut SqliteConnection, car: &Car) -> Result<(), CarWriteError> {
    let rows = diesel::update(cars::table.filter(cars::id.eq(car.id.to_string())))
        .set(&UpdateCarEntity::from(car))
        .execute(conn)?;
    if rows == 0 {
        return Err(CarWriteError::MissingCar);
    }
    Ok(())
}

#[async_trait]
impl CarRepository for CarOrmCollection {
    async fn get_by_id(&self, id: &CarId) -> Option<Car> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_by_id: {}", e);
                return None;
            }
        };

        let id_str = id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Option<CarEntity>> {
                cars::table
                    .filter(cars::id.eq(id_str))
                    .select(CarEntity::as_select())
                    .first(conn)
                    .optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error retrieving Car {}: {}", id, e);
                None
            }
            Err(e) => {
                tracing::error!("Error retrieving Car: {}", e);
                None
            }
        }
    }

    async fn list_by_owner(&self, user_id: &Uuid, include_inactive: bool) -> Vec<Car> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for list_by_owner: {}", e);
                return vec![];
            }
        };

        let user_id_str = user_id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Vec<CarEntity>> {
                let mut query = cars::table
                    .filter(cars::user_id.eq(user_id_str))
                    .into_boxed();
                if !include_inactive {
                    query = query.filter(cars::active.eq(true));
                }
                query
                    .order((
                        cars::make.asc(),
                        cars::model.asc(),
                        cars::year.asc(),
                        cars::id.asc(),
                    ))
                    .select(CarEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(Ok(entities)) => entities
                .into_iter()
                .filter_map(|e| e.into_domain())
                .collect(),
            Ok(Err(e)) => {
                tracing::error!("Database error listing Cars: {}", e);
                vec![]
            }
            Err(e) => {
                tracing::error!("Error listing Cars: {}", e);
                vec![]
            }
        }
    }

    async fn save(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let result = conn.interact(move |conn| insert_car(conn, &car)).await;

        match result {
            Ok(Ok(saved)) => Ok(saved),
            Ok(Err(e)) => Err(e.into_repository_error("saving")),
            Err(e) => {
                tracing::error!("Error saving Car: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let car_for_update = car.clone();
        let result = conn
            .interact(move |conn| update_car(conn, &car_for_update))
            .await;

        match result {
            Ok(Ok(())) => Ok(car),
            Ok(Err(e)) => Err(e.into_repository_error("updating")),
            Err(e) => {
                tracing::error!("Error updating Car: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn delete(&self, id: &CarId) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = id.to_string();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::delete(cars::table.filter(cars::id.eq(id_str))).execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(()),
            Ok(Ok(_)) => Err(Box::new(MissingCar)),
            Ok(Err(e)) => {
                tracing::error!("Error deleting Car: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error deleting Car: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn load_owned(&self, id: &CarId, user_id: &Uuid) -> Option<Car> {
        let car = self.get_by_id(id).await?;
        if car.is_owned_by(user_id) {
            Some(car)
        } else {
            tracing::warn!(
                "Car {} is not owned by user {}. Access denied.",
                id,
                user_id
            );
            None
        }
    }

    async fn find_owned_by_vin(
        &self,
        user_id: &Uuid,
        vin: &str,
        exclude_id: Option<&CarId>,
    ) -> Option<Car> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for find_owned_by_vin: {}", e);
                return None;
            }
        };

        let user_id_str = user_id.to_string();
        let vin_owned = vin.to_string();
        let exclude = exclude_id.map(|id| id.to_string());
        let result = conn
            .interact(move |conn| -> QueryResult<Option<CarEntity>> {
                let mut query = cars::table
                    .filter(cars::user_id.eq(user_id_str))
                    .filter(cars::vin.eq(vin_owned))
                    .into_boxed();
                if let Some(ex) = exclude {
                    query = query.filter(cars::id.ne(ex));
                }
                query.select(CarEntity::as_select()).first(conn).optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error find_owned_by_vin: {}", e);
                None
            }
            Err(e) => {
                tracing::error!("Error find_owned_by_vin: {}", e);
                None
            }
        }
    }

    async fn find_owned_by_license_plate(
        &self,
        user_id: &Uuid,
        license_plate: &str,
        exclude_id: Option<&CarId>,
    ) -> Option<Car> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!(
                    "Could not get db connection for find_owned_by_license_plate: {}",
                    e
                );
                return None;
            }
        };

        let user_id_str = user_id.to_string();
        let plate_owned = license_plate.to_string();
        let exclude = exclude_id.map(|id| id.to_string());
        let result = conn
            .interact(move |conn| -> QueryResult<Option<CarEntity>> {
                let mut query = cars::table
                    .filter(cars::user_id.eq(user_id_str))
                    .filter(cars::license_plate.eq(plate_owned))
                    .into_boxed();
                if let Some(ex) = exclude {
                    query = query.filter(cars::id.ne(ex));
                }
                query.select(CarEntity::as_select()).first(conn).optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error find_owned_by_license_plate: {}", e);
                None
            }
            Err(e) => {
                tracing::error!("Error find_owned_by_license_plate: {}", e);
                None
            }
        }
    }
}
