use uuid::Uuid;

pub trait Principal: Sync + Send {
    fn user_id(&self) -> &Uuid;
    fn tenant(&self) -> &str;
}
