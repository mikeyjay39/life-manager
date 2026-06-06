use diesel::prelude::*;
use serde::Serialize;

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::auth_users)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct AuthUserEntity {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub tenant: String,
    pub active: bool,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::auth_users)]
pub struct NewAuthUserEntity {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub tenant: String,
    pub active: bool,
    pub created_at: chrono::NaiveDateTime,
}
