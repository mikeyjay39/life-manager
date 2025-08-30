diesel::table! {
    document (id) {
        id -> Int4,
        #[max_length = 255]
        title -> Varchar,
        content -> Text,
        created_at -> Nullable<Timestamp>,
    }
}
