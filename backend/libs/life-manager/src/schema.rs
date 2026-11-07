diesel::table! {
    documents (id) {
        id -> Text,
        title -> Text,
        content -> Text,
        user_id -> Text,
        created_at -> Timestamp,
        issued_date -> Nullable<Timestamp>,
        expire_date -> Nullable<Timestamp>,
        storage_provider -> Nullable<Text>,
        storage_share_id -> Nullable<Text>,
        storage_node_id -> Nullable<Text>,
        storage_filename -> Nullable<Text>,
        storage_mime_type -> Nullable<Text>,
    }
}

diesel::table! {
    health_members (id) {
        id -> Text,
        user_id -> Text,
        display_name -> Text,
        birth_date -> Nullable<Date>,
        notes -> Nullable<Text>,
        active -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        deactivated_at -> Nullable<Timestamp>,
    }
}

diesel::table! {
    cars (id) {
        id -> Text,
        user_id -> Text,
        display_name -> Nullable<Text>,
        make -> Text,
        model -> Text,
        year -> Integer,
        vin -> Nullable<Text>,
        license_plate -> Nullable<Text>,
        notes -> Nullable<Text>,
        insurance_document_id -> Nullable<Text>,
        registration_document_id -> Nullable<Text>,
        active -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        deactivated_at -> Nullable<Timestamp>,
    }
}

diesel::table! {
    doctor_visits (id) {
        id -> Text,
        user_id -> Text,
        health_member_id -> Text,
        visited_on -> Date,
        provider_name -> Nullable<Text>,
        reason -> Nullable<Text>,
        notes -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    health_readings (id) {
        id -> Text,
        user_id -> Text,
        health_member_id -> Text,
        recorded_on -> Date,
        height_cm -> Nullable<Double>,
        weight_kg -> Nullable<Double>,
        systolic_mm_hg -> Nullable<Integer>,
        diastolic_mm_hg -> Nullable<Integer>,
        heart_rate_bpm -> Nullable<Integer>,
        notes -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    tags (id) {
        id -> Text,
        name -> Text,
    }
}

diesel::table! {
    document_tags (document_id, tag_id) {
        document_id -> Text,
        tag_id -> Text,
    }
}

diesel::joinable!(document_tags -> documents (document_id));
diesel::joinable!(document_tags -> tags (tag_id));

diesel::allow_tables_to_appear_in_same_query!(
    cars,
    doctor_visits,
    documents,
    health_members,
    health_readings,
    tags,
    document_tags,
);
