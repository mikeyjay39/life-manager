use axum::{
    Router,
    routing::{get, post},
};

use crate::infrastructure::{
    app_state::LifeManagerState,
    doctor_visit::doctor_visit_handler::{
        create_doctor_visit, delete_doctor_visit, get_doctor_visit, list_doctor_visits,
        update_doctor_visit,
    },
};

pub fn doctor_visit_router() -> Router<LifeManagerState> {
    Router::new()
        .route("/", post(create_doctor_visit).get(list_doctor_visits))
        .route(
            "/{id}",
            get(get_doctor_visit)
                .put(update_doctor_visit)
                .delete(delete_doctor_visit),
        )
}
