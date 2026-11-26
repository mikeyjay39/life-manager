use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    car::car_handler::{create_car, deactivate_car, delete_car, get_car, list_cars, update_car},
    shared::app_state::LifeManagerState,
};

pub fn car_router() -> Router<LifeManagerState> {
    Router::new()
        .route("/", post(create_car).get(list_cars))
        .route("/{id}/deactivate", post(deactivate_car))
        .route("/{id}", get(get_car).put(update_car).delete(delete_car))
}
