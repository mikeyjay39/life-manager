// use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::Serialize;

#[derive(Serialize, Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::documents)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct DocumentEntity {
    pub id: i32,
    pub title: String,
    pub content: String,
    pub user_id: String,
    // pub created_at: Option<NaiveDateTime>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::documents)]
pub struct NewDocumentEntity {
    pub title: String,
    pub content: String,
    // pub created_at: Option<NaiveDateTime>,
}
