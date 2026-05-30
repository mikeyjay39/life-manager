diesel::table! {
    documents (id) {
        id -> Text,
        title -> Text,
        content -> Text,
        user_id -> Text,
    }
}
