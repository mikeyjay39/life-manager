use axum::Json;

use crate::AppError;

pub type AppResult<T> = Result<Json<T>, AppError>;
