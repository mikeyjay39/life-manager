use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::LifeManagerState,
    car_maintenance_event::car_maintenance_event_handler::{
        create_car_maintenance_event, delete_car_maintenance_event, get_car_maintenance_event,
        list_car_maintenance_events, update_car_maintenance_event,
    },
};

pub fn car_maintenance_event_router() -> Router<LifeManagerState> {
    Router::new()
        .route(
            "/",
            post(create_car_maintenance_event).get(list_car_maintenance_events),
        )
        .route(
            "/{id}",
            get(get_car_maintenance_event)
                .put(update_car_maintenance_event)
                .delete(delete_car_maintenance_event),
        )
}
