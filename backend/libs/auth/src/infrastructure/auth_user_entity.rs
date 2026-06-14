use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

use crate::domain::principal::Principal;

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

impl Principal for AuthUserEntity {
    /**
     * SQLite does not have a native UUID type, so we store the UUID as a string in the database. When we need to use it as a UUID in our application, we parse it back into a Uuid type. This method handles that conversion and also includes error handling in case the string cannot be parsed into a valid UUID.
     * The error case should never happen. If we reach it then we need to figure out how an none uuid
     * string got into the database and fix that issue. For now we log the error and return a default
     * UUID, but in production code we should handle this more gracefully, perhaps by returning a
     * Result type or by implementing a more robust error handling strategy.
     */
    fn user_id(&self) -> Uuid {
        match Uuid::parse_str(&self.id) {
            Ok(uuid) => uuid,
            Err(e) => {
                tracing::error!(
                    "Failed to parse user_id as string from uuid. Id was: {}. : {}. ",
                    &self.id,
                    e
                );
                Uuid::nil()
            }
        }
    }

    fn tenant(&self) -> &str {
        self.tenant.as_str()
    }

    fn password_hash(&self) -> &str {
        &self.password_hash
    }
}
