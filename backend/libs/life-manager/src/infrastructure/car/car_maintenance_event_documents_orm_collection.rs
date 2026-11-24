use std::sync::Arc;

use async_trait::async_trait;
use deadpool_diesel::sqlite::Pool;

use crate::{
    application::car::car_maintenance_event_documents_writer::CarMaintenanceEventDocumentsWriter,
    domain::{car::car_maintenance_event::CarMaintenanceEvent, document::Document},
    infrastructure::{
        car::car_maintenance_event_orm_collection::{
            MaintenanceEventWriteError, insert_maintenance_event, update_maintenance_event,
        },
        document::document_orm_collection::insert_documents_with_tags,
    },
};

/// SQLite adapter for `CarMaintenanceEventDocumentsWriter`: one IMMEDIATE
/// transaction per call.
#[derive(Clone)]
pub struct CarMaintenanceEventDocumentsOrmCollection {
    pub pool: Arc<Pool>,
}

impl CarMaintenanceEventDocumentsOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl CarMaintenanceEventDocumentsWriter for CarMaintenanceEventDocumentsOrmCollection {
    async fn create(
        &self,
        event: CarMaintenanceEvent,
        new_documents: Vec<Document>,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let event_id = event.id;
        // IMMEDIATE keeps the active-Car check (in insert_maintenance_event)
        // under the write lock, as CarMaintenanceEventOrmCollection::save does.
        let result = conn
            .interact(move |conn| {
                conn.immediate_transaction(
                    |conn| -> Result<CarMaintenanceEvent, MaintenanceEventWriteError> {
                        insert_documents_with_tags(conn, &new_documents)?;
                        insert_maintenance_event(conn, &event)
                    },
                )
            })
            .await;

        match result {
            Ok(Ok(saved)) => Ok(saved),
            Ok(Err(e)) => Err(e.into_repository_error("saving with Documents", event_id)),
            Err(e) => {
                tracing::error!(
                    "Error saving CarMaintenanceEvent {} with Documents: {}",
                    event_id,
                    e
                );
                Err(Box::new(e))
            }
        }
    }

    async fn update(
        &self,
        event: CarMaintenanceEvent,
        new_documents: Vec<Document>,
    ) -> Result<CarMaintenanceEvent, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let event_id = event.id;
        let event_for_update = event.clone();
        let result = conn
            .interact(move |conn| {
                conn.immediate_transaction(|conn| -> Result<(), MaintenanceEventWriteError> {
                    insert_documents_with_tags(conn, &new_documents)?;
                    update_maintenance_event(conn, &event_for_update)
                })
            })
            .await;

        match result {
            Ok(Ok(())) => Ok(event),
            Ok(Err(e)) => Err(e.into_repository_error("updating with Documents", event_id)),
            Err(e) => {
                tracing::error!(
                    "Error updating CarMaintenanceEvent {} with Documents: {}",
                    event_id,
                    e
                );
                Err(Box::new(e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use uuid::Uuid;

    use super::*;
    use crate::{
        application::car::{
            car_maintenance_event_repository::{
                CarMaintenanceEventRepository, InactiveCarForMaintenanceEvent,
                MissingCarMaintenanceEvent,
            },
            car_repository::CarRepository,
        },
        domain::car::{
            Car, CarProfileInput,
            car_maintenance_event::{CarMaintenanceEventInput, CarMaintenanceEventType},
        },
        infrastructure::{
            car::{
                car_maintenance_event_orm_collection::CarMaintenanceEventOrmCollection,
                car_orm_collection::CarOrmCollection,
            },
            shared::sqlite_test_support::{
                assert_no_document_rows, count_rows, migrated_test_database,
            },
        },
    };

    fn given_active_car(user_id: Uuid) -> Car {
        Car::create(
            user_id,
            CarProfileInput {
                display_name: None,
                make: "Toyota",
                model: "Corolla",
                year: 2020,
                vin: None,
                license_plate: None,
                notes: None,
                insurance_document_id: None,
                registration_document_id: None,
            },
        )
        .expect("valid car")
    }

    fn given_event(car: &Car, document_id: Option<Uuid>) -> CarMaintenanceEvent {
        CarMaintenanceEvent::create(
            car,
            CarMaintenanceEventInput {
                occurred_on: NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                event_type: CarMaintenanceEventType::OilChange,
                odometer_miles: Some(50_000),
                cost_cents: Some(5_999),
                title: None,
                notes: None,
                document_id,
            },
        )
        .expect("valid event")
    }

    fn given_tagged_receipt(user_id: Uuid) -> Document {
        let mut document = Document::new("Receipt", "oil change", user_id);
        document.set_tags(&["receipt".to_string()]);
        document
    }

    #[tokio::test]
    async fn given_active_car_when_create_with_receipt_then_document_tags_and_event_committed() {
        // Given
        let db = migrated_test_database().await;
        let user_id = Uuid::new_v4();
        let car = CarOrmCollection::new(db.pool.clone())
            .save(given_active_car(user_id))
            .await
            .expect("car");
        let receipt = given_tagged_receipt(user_id);
        let event = given_event(&car, Some(receipt.id));
        let writer = CarMaintenanceEventDocumentsOrmCollection::new(db.pool.clone());

        // When
        let saved = writer.create(event, vec![receipt]).await.expect("create");

        // Then
        assert_eq!(count_rows(&db.pool, "documents").await, 1);
        assert_eq!(count_rows(&db.pool, "document_tags").await, 1);
        let stored = CarMaintenanceEventOrmCollection::new(db.pool.clone())
            .get_by_id(&saved.id)
            .await
            .expect("event stored");
        assert_eq!(stored.document_id, saved.document_id);
    }

    #[tokio::test]
    async fn given_inactive_car_when_create_with_receipt_then_rollback_leaves_no_document() {
        // Given
        let db = migrated_test_database().await;
        let user_id = Uuid::new_v4();
        let mut car = given_active_car(user_id);
        // Build the event while the Car is active, so only the SQL check rejects it.
        let receipt = given_tagged_receipt(user_id);
        let event = given_event(&car, Some(receipt.id));
        car.deactivate();
        CarOrmCollection::new(db.pool.clone())
            .save(car)
            .await
            .expect("inactive car");
        let writer = CarMaintenanceEventDocumentsOrmCollection::new(db.pool.clone());

        // When
        let err = writer
            .create(event, vec![receipt])
            .await
            .expect_err("inactive car");

        // Then
        assert!(
            err.downcast_ref::<InactiveCarForMaintenanceEvent>()
                .is_some()
        );
        assert_no_document_rows(&db.pool).await;
        assert_eq!(count_rows(&db.pool, "car_maintenance_events").await, 0);
    }

    #[tokio::test]
    async fn given_missing_event_when_update_with_receipt_then_rollback_leaves_no_document() {
        // Given
        let db = migrated_test_database().await;
        let user_id = Uuid::new_v4();
        let car = CarOrmCollection::new(db.pool.clone())
            .save(given_active_car(user_id))
            .await
            .expect("car");
        let receipt = given_tagged_receipt(user_id);
        let never_saved = given_event(&car, Some(receipt.id));
        let writer = CarMaintenanceEventDocumentsOrmCollection::new(db.pool.clone());

        // When
        let err = writer
            .update(never_saved, vec![receipt])
            .await
            .expect_err("missing event");

        // Then
        assert!(err.downcast_ref::<MissingCarMaintenanceEvent>().is_some());
        assert_no_document_rows(&db.pool).await;
    }
}
