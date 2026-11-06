use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::LifeManagerState,
    health_member::health_member_handler::{
        create_health_member, deactivate_health_member, get_health_member, list_health_members,
        update_health_member,
    },
};

pub fn health_member_router() -> Router<LifeManagerState> {
    Router::new()
        .route("/", post(create_health_member).get(list_health_members))
        .route("/{id}/deactivate", post(deactivate_health_member))
        .route("/{id}", get(get_health_member).put(update_health_member))
}
