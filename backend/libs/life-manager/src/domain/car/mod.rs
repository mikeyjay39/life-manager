// The private module holds the aggregate root; `pub use` re-exports it at the folder path.
#[allow(clippy::module_inception)]
mod car;
pub mod car_maintenance_event;

pub use car::*;
