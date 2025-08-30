use chrono::NaiveDateTime;
use diesel::prelude::*;

#[derive(Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::document)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct DocumentEntity {
    pub id: i32,
    pub title: String,
    pub content: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::document)]
pub struct NewDocumentEntity {
    pub title: String,
    pub content: String,
    pub created_at: Option<NaiveDateTime>,
}
