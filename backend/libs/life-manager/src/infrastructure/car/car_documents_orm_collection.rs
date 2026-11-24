use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;
use diesel::Connection;

use crate::{
    application::car::car_documents_writer::CarDocumentsWriter,
    domain::{car::Car, document::Document},
    infrastructure::{
        car::car_orm_collection::{CarWriteError, insert_car, update_car},
        document::document_orm_collection::insert_documents_with_tags,
    },
};

/// SQLite adapter for `CarDocumentsWriter`: one transaction per call.
#[derive(Clone)]
pub struct CarDocumentsOrmCollection {
    pub pool: Arc<Pool>,
}

impl CarDocumentsOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl CarDocumentsWriter for CarDocumentsOrmCollection {
    async fn create(
        &self,
        car: Car,
        new_documents: Vec<Document>,
    ) -> Result<Car, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        // A deferred transaction is enough: there is no read check to protect.
        // The unique VIN and plate indexes are the final guard, and their
        // failure rolls back the Documents.
        let result = conn
            .interact(move |conn| {
                conn.transaction(|conn| -> Result<Car, CarWriteError> {
                    insert_documents_with_tags(conn, &new_documents)?;
                    insert_car(conn, &car)
                })
            })
            .await;

        match result {
            Ok(Ok(saved)) => Ok(saved),
            Ok(Err(e)) => Err(e.into_repository_error("saving with Documents")),
            Err(e) => {
                tracing::error!("Error saving Car with Documents: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(
        &self,
        car: Car,
        new_documents: Vec<Document>,
    ) -> Result<Car, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let car_for_update = car.clone();
        // IMMEDIATE takes the write lock first, so the Car row cannot be
        // removed between the Document inserts and the UPDATE.
        let result = conn
            .interact(move |conn| {
                conn.immediate_transaction(|conn| -> Result<(), CarWriteError> {
                    insert_documents_with_tags(conn, &new_documents)?;
                    update_car(conn, &car_for_update)
                })
            })
            .await;

        match result {
            Ok(Ok(())) => Ok(car),
            Ok(Err(e)) => Err(e.into_repository_error("updating with Documents")),
            Err(e) => {
                tracing::error!("Error updating Car with Documents: {}", e);
                Err(Box::new(e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::{
        application::car::car_repository::{CarRepository, DuplicateCarVin, MissingCar},
        domain::car::CarProfileInput,
        infrastructure::{
            car::car_orm_collection::CarOrmCollection,
            shared::sqlite_test_support::{
                assert_no_document_rows, count_rows, migrated_test_database,
            },
        },
    };

    const SAMPLE_VIN: &str = "1HGCM82633A004352";

    fn given_car(user_id: Uuid, vin: Option<&str>, insurance_document_id: Option<Uuid>) -> Car {
        Car::create(
            user_id,
            CarProfileInput {
                display_name: None,
                make: "Toyota",
                model: "Corolla",
                year: 2020,
                vin,
                license_plate: None,
                notes: None,
                insurance_document_id,
                registration_document_id: None,
            },
        )
        .expect("valid car")
    }

    fn given_tagged_document(user_id: Uuid) -> Document {
        let mut document = Document::new("Insurance", "policy", user_id);
        document.set_tags(&["car".to_string(), "insurance".to_string()]);
        document
    }

    #[tokio::test]
    async fn given_new_document_when_create_then_document_tags_and_car_committed() {
        // Given
        let db = migrated_test_database().await;
        let writer = CarDocumentsOrmCollection::new(db.pool.clone());
        let user_id = Uuid::new_v4();
        let document = given_tagged_document(user_id);
        let car = given_car(user_id, None, Some(document.id));

        // When
        let saved = writer.create(car, vec![document]).await.expect("create");

        // Then
        assert_eq!(count_rows(&db.pool, "documents").await, 1);
        assert_eq!(count_rows(&db.pool, "document_tags").await, 2);
        let stored = CarOrmCollection::new(db.pool.clone())
            .get_by_id(&saved.id)
            .await
            .expect("car stored");
        assert_eq!(stored.insurance_document_id, saved.insurance_document_id);
    }

    #[tokio::test]
    async fn given_duplicate_vin_when_create_with_new_document_then_rollback_leaves_no_document() {
        // Given
        let db = migrated_test_database().await;
        let user_id = Uuid::new_v4();
        CarOrmCollection::new(db.pool.clone())
            .save(given_car(user_id, Some(SAMPLE_VIN), None))
            .await
            .expect("first car");
        let writer = CarDocumentsOrmCollection::new(db.pool.clone());
        let document = given_tagged_document(user_id);
        let car = given_car(user_id, Some(SAMPLE_VIN), Some(document.id));

        // When
        let err = writer
            .create(car, vec![document])
            .await
            .expect_err("duplicate VIN");

        // Then
        assert!(err.downcast_ref::<DuplicateCarVin>().is_some());
        assert_no_document_rows(&db.pool).await;
        assert_eq!(count_rows(&db.pool, "cars").await, 1);
    }

    #[tokio::test]
    async fn given_duplicate_vin_when_update_with_new_document_then_rollback_leaves_no_document() {
        // Given
        let db = migrated_test_database().await;
        let user_id = Uuid::new_v4();
        let cars = CarOrmCollection::new(db.pool.clone());
        cars.save(given_car(user_id, Some(SAMPLE_VIN), None))
            .await
            .expect("first car");
        let mut second = cars
            .save(given_car(user_id, None, None))
            .await
            .expect("second car");
        let writer = CarDocumentsOrmCollection::new(db.pool.clone());
        let document = given_tagged_document(user_id);
        second.vin = Some(SAMPLE_VIN.to_string());
        second.insurance_document_id = Some(document.id);

        // When
        let err = writer
            .update(second, vec![document])
            .await
            .expect_err("duplicate VIN");

        // Then
        assert!(err.downcast_ref::<DuplicateCarVin>().is_some());
        assert_no_document_rows(&db.pool).await;
    }

    #[tokio::test]
    async fn given_missing_car_when_update_with_new_document_then_rollback_leaves_no_document() {
        // Given
        let db = migrated_test_database().await;
        let user_id = Uuid::new_v4();
        let writer = CarDocumentsOrmCollection::new(db.pool.clone());
        let document = given_tagged_document(user_id);
        let never_saved = given_car(user_id, None, Some(document.id));

        // When
        let err = writer
            .update(never_saved, vec![document])
            .await
            .expect_err("missing car");

        // Then
        assert!(err.downcast_ref::<MissingCar>().is_some());
        assert_no_document_rows(&db.pool).await;
    }
}
