diesel::table! {
    auth_users (id) {
        id -> Uuid,
        username -> Text,
        password_hash -> Text,
        tenant -> Text,
        active -> Bool,
        created_at -> Timestamp,
    }
}
