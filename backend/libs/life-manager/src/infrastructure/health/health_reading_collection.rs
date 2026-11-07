use async_trait::async_trait;
use chrono::NaiveDate;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    application::health_reading_repository::HealthReadingRepository,
    domain::{
        health_member::HealthMemberId,
        health_reading::{HealthReading, HealthReadingId},
    },
};

pub struct HealthReadingCollection {
    pub readings: Mutex<Vec<HealthReading>>,
}

impl HealthReadingCollection {
    pub fn new() -> Self {
        Self {
            readings: Mutex::new(Vec::new()),
        }
    }
}

impl Default for HealthReadingCollection {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HealthReadingRepository for HealthReadingCollection {
    async fn get_by_id(&self, id: &HealthReadingId) -> Option<HealthReading> {
        self.readings
            .lock()
            .await
            .iter()
            .find(|r| r.id == *id)
            .cloned()
    }

    async fn list_by_member(
        &self,
        health_member_id: &HealthMemberId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
    ) -> Vec<HealthReading> {
        let mut readings: Vec<HealthReading> = self
            .readings
            .lock()
            .await
            .iter()
            .filter(|r| r.health_member_id == *health_member_id && r.user_id == *user_id)
            .filter(|r| from.is_none_or(|f| r.recorded_on >= f))
            .filter(|r| to.is_none_or(|t| r.recorded_on <= t))
            .cloned()
            .collect();
        readings.sort_by(|a, b| {
            b.recorded_on
                .cmp(&a.recorded_on)
                .then_with(|| b.id.0.cmp(&a.id.0))
        });
        readings
    }

    async fn find_by_member_and_date(
        &self,
        health_member_id: &HealthMemberId,
        recorded_on: NaiveDate,
    ) -> Option<HealthReading> {
        self.readings
            .lock()
            .await
            .iter()
            .find(|r| r.health_member_id == *health_member_id && r.recorded_on == recorded_on)
            .cloned()
    }

    async fn save(
        &self,
        reading: HealthReading,
    ) -> Result<HealthReading, Box<dyn std::error::Error>> {
        self.readings.lock().await.push(reading.clone());
        Ok(reading)
    }

    async fn update(
        &self,
        reading: HealthReading,
    ) -> Result<HealthReading, Box<dyn std::error::Error>> {
        let mut readings = self.readings.lock().await;
        let index = readings
            .iter()
            .position(|r| r.id == reading.id)
            .ok_or("HealthReading not found")?;
        readings[index] = reading.clone();
        Ok(reading)
    }

    async fn delete(&self, id: &HealthReadingId) -> Result<(), Box<dyn std::error::Error>> {
        let mut readings = self.readings.lock().await;
        let index = readings
            .iter()
            .position(|r| r.id == *id)
            .ok_or("HealthReading not found")?;
        readings.remove(index);
        Ok(())
    }

    async fn load_owned(&self, id: &HealthReadingId, user_id: &Uuid) -> Option<HealthReading> {
        self.readings
            .lock()
            .await
            .iter()
            .find(|r| r.id == *id && r.user_id == *user_id)
            .cloned()
    }
}
