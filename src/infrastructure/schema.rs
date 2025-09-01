// @generated automatically by Diesel CLI.

diesel::table! {
    documents (id) {
        id -> Int4,
        #[max_length = 255]
        title -> Varchar,
        content -> Text,
    }
}
