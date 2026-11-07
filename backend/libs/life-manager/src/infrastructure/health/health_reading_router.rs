use axum::{Router, routing::post};

use crate::infrastructure::{
    app_state::LifeManagerState,
    health::health_reading_handler::{
        create_health_reading, delete_health_reading, list_health_readings, update_health_reading,
    },
};

pub fn health_reading_router() -> Router<LifeManagerState> {
    Router::new()
        .route("/", post(create_health_reading).get(list_health_readings))
        .route(
            "/{id}",
            axum::routing::put(update_health_reading).delete(delete_health_reading),
        )
}
