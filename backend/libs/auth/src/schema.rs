diesel::table! {
    auth_users (id) {
        id -> Text,
        username -> Text,
        password_hash -> Text,
        tenant -> Text,
        active -> Bool,
        created_at -> Timestamp,
    }
}

diesel::table! {
    auth_email_tokens (id) {
        id -> Text,
        user_id -> Text,
        tenant -> Text,
        purpose -> Text,
        token_hash -> Text,
        expires_at -> Timestamp,
        consumed_at -> Nullable<Timestamp>,
        created_at -> Timestamp,
    }
}

diesel::joinable!(auth_email_tokens -> auth_users (user_id));

diesel::allow_tables_to_appear_in_same_query!(auth_users, auth_email_tokens);
