// use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::documents)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct DocumentEntity {
    pub id: i32,
    pub title: String,
    pub content: String,
    pub user_id: Uuid,
    // pub created_at: Option<NaiveDateTime>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::documents)]
pub struct NewDocumentEntity {
    pub title: String,
    pub content: String,
    pub user_id: Uuid,
    // pub created_at: Option<NaiveDateTime>,
}
