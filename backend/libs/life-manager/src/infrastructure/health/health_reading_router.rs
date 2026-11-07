use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::LifeManagerState,
    health::health_reading_handler::{create_health_reading, list_health_readings},
};

pub fn health_reading_router() -> Router<LifeManagerState> {
    Router::new().route("/", post(create_health_reading).get(list_health_readings))
}
