diesel::table! {
    documents (id) {
        id -> Int4,
        #[max_length = 255]
        title -> Varchar,
        content -> Text,
        user_id -> VarChar
    }
}
