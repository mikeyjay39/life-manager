use uuid::Uuid;

pub const ADMIN_USER_ID: &str = "00000000-0000-0000-0000-000000000001";

pub fn admin_user_uuid() -> Uuid {
    Uuid::parse_str(ADMIN_USER_ID).expect("Invalid ADMIN_USER_ID format")
}
