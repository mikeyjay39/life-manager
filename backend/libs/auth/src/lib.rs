mod application;
mod domain;
pub mod infrastructure;
mod router;
mod schema;

// HACK: do not export application or domain. TODO: refactor this
pub use domain::login_request::LoginRequest;
pub use domain::login_request::LoginResponse;
pub use infrastructure::auth_state::{AuthState, AuthStateBuilder};
pub use infrastructure::auth_user::AuthUser;
pub use infrastructure::db::run_migrations;
pub use router::auth_router;
