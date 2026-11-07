use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::LifeManagerState,
    car::car_handler::{
        create_car, deactivate_car, delete_car, get_car, list_cars, update_car,
    },
};

pub fn car_router() -> Router<LifeManagerState> {
    Router::new()
        .route("/", post(create_car).get(list_cars))
        .route("/{id}/deactivate", post(deactivate_car))
        .route(
            "/{id}",
            get(get_car).put(update_car).delete(delete_car),
        )
}
