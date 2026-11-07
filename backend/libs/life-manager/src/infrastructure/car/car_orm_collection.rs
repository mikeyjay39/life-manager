use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;
use diesel::{
    ExpressionMethods, OptionalExtension, QueryDsl, QueryResult, RunQueryDsl, SelectableHelper,
};
use uuid::Uuid;

use crate::{
    application::car_repository::{
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

fn is_unique_violation(err: &diesel::result::Error) -> bool {
    matches!(
        err,
        diesel::result::Error::DatabaseError(
            diesel::result::DatabaseErrorKind::UniqueViolation,
            _
        )
    )
}

fn map_unique_error(err: diesel::result::Error) -> Box<dyn std::error::Error> {
    let msg = err.to_string().to_lowercase();
    if msg.contains("license_plate") {
        Box::new(DuplicateCarLicensePlate)
    } else if msg.contains("vin") {
        Box::new(DuplicateCarVin)
    } else {
        Box::new(err)
    }
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
            Ok(Ok(entities)) => entities.into_iter().filter_map(|e| e.into_domain()).collect(),
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
        let new_entity = NewCarEntity::from(&car);
        let car_id = car.id;

        let result = conn
            .interact(move |conn| -> QueryResult<CarEntity> {
                diesel::insert_into(cars::table)
                    .values(&new_entity)
                    .returning(CarEntity::as_returning())
                    .get_result(conn)
            })
            .await;

        match result {
            Ok(Ok(entity)) => entity
                .into_domain()
                .ok_or_else(|| "Failed to map saved Car".into()),
            Ok(Err(e)) if is_unique_violation(&e) => Err(map_unique_error(e)),
            Ok(Err(e)) => {
                tracing::error!("Error saving Car {}: {}", car_id, e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error saving Car {}: {}", car_id, e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(&self, car: Car) -> Result<Car, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = car.id.to_string();
        let update_entity = UpdateCarEntity::from(&car);
        let car_for_return = car.clone();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::update(cars::table.filter(cars::id.eq(id_str)))
                    .set(&update_entity)
                    .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(car_for_return),
            Ok(Ok(_)) => Err("Car not found for update".into()),
            Ok(Err(e)) if is_unique_violation(&e) => Err(map_unique_error(e)),
            Ok(Err(e)) => {
                tracing::error!("Error updating Car: {}", e);
                Err(Box::new(e))
            }
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
