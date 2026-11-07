use std::sync::Arc;

use async_trait::async_trait;
use chrono::NaiveDate;
use deadpool_diesel::sqlite::Pool;
use diesel::{
    ExpressionMethods, OptionalExtension, QueryDsl, QueryResult, RunQueryDsl, SelectableHelper,
    SqliteConnection,
};
use uuid::Uuid;

use crate::{
    application::doctor_visit_repository::{
        DoctorVisitRepository, InactiveHealthMemberForVisit, MissingDoctorVisit,
        MissingHealthMemberForVisit,
    },
    domain::{
        doctor_visit::{DoctorVisit, DoctorVisitId},
        health_member::HealthMemberId,
    },
    infrastructure::doctor_visit::doctor_visit_entity::{
        DoctorVisitEntity, NewDoctorVisitEntity, UpdateDoctorVisitEntity,
    },
    schema::{doctor_visits, health_members},
};

/// Local failure for a write transaction (Diesel + domain checks).
enum WriteTxError {
    MemberMissing,
    InactiveMember,
    VisitMissing,
    Diesel(diesel::result::Error),
}

impl From<diesel::result::Error> for WriteTxError {
    fn from(value: diesel::result::Error) -> Self {
        Self::Diesel(value)
    }
}

/// Checks that the member exists, has the same owner, and is active.
fn ensure_member_active(
    conn: &mut SqliteConnection,
    member_id: &str,
    user_id: &str,
) -> Result<(), WriteTxError> {
    let member_active: Option<bool> = health_members::table
        .filter(health_members::id.eq(member_id))
        .filter(health_members::user_id.eq(user_id))
        .select(health_members::active)
        .first(conn)
        .optional()?;
    match member_active {
        Some(true) => Ok(()),
        Some(false) => Err(WriteTxError::InactiveMember),
        None => Err(WriteTxError::MemberMissing),
    }
}

/// Maps a write transaction failure to a repository error.
fn map_write_error(
    context: &str,
    visit_id: DoctorVisitId,
    error: WriteTxError,
) -> Box<dyn std::error::Error> {
    match error {
        WriteTxError::MemberMissing => Box::new(MissingHealthMemberForVisit),
        WriteTxError::InactiveMember => Box::new(InactiveHealthMemberForVisit),
        WriteTxError::VisitMissing => Box::new(MissingDoctorVisit),
        WriteTxError::Diesel(e) => {
            tracing::error!("Error {} DoctorVisit {}: {}", context, visit_id, e);
            Box::new(e)
        }
    }
}

#[derive(Clone)]
pub struct DoctorVisitOrmCollection {
    pub pool: Arc<Pool>,
}

impl DoctorVisitOrmCollection {
    pub fn new(pool: Arc<Pool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl DoctorVisitRepository for DoctorVisitOrmCollection {
    async fn get_by_id(&self, id: &DoctorVisitId) -> Option<DoctorVisit> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for get_by_id: {}", e);
                return None;
            }
        };

        let id_str = id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Option<DoctorVisitEntity>> {
                doctor_visits::table
                    .filter(doctor_visits::id.eq(id_str))
                    .select(DoctorVisitEntity::as_select())
                    .first(conn)
                    .optional()
            })
            .await;

        match result {
            Ok(Ok(Some(entity))) => entity.into_domain(),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                tracing::error!("Database error retrieving DoctorVisit {}: {}", id, e);
                None
            }
            Err(e) => {
                tracing::error!("Error retrieving DoctorVisit: {}", e);
                None
            }
        }
    }

    async fn list_by_member(
        &self,
        health_member_id: &HealthMemberId,
        user_id: &Uuid,
        from: Option<NaiveDate>,
        to: Option<NaiveDate>,
    ) -> Vec<DoctorVisit> {
        let conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("Could not get db connection for list_by_member: {}", e);
                return vec![];
            }
        };

        let member_id_str = health_member_id.to_string();
        let user_id_str = user_id.to_string();
        let result = conn
            .interact(move |conn| -> QueryResult<Vec<DoctorVisitEntity>> {
                let mut query = doctor_visits::table
                    .filter(doctor_visits::health_member_id.eq(member_id_str))
                    .filter(doctor_visits::user_id.eq(user_id_str))
                    .into_boxed();
                if let Some(from) = from {
                    query = query.filter(doctor_visits::visited_on.ge(from));
                }
                if let Some(to) = to {
                    query = query.filter(doctor_visits::visited_on.le(to));
                }
                query
                    .order((
                        doctor_visits::visited_on.desc(),
                        doctor_visits::created_at.desc(),
                        doctor_visits::id.desc(),
                    ))
                    .select(DoctorVisitEntity::as_select())
                    .get_results(conn)
            })
            .await;

        match result {
            Ok(Ok(entities)) => entities
                .into_iter()
                .filter_map(|e| e.into_domain())
                .collect(),
            Ok(Err(e)) => {
                tracing::error!("Database error listing DoctorVisits: {}", e);
                vec![]
            }
            Err(e) => {
                tracing::error!("Error listing DoctorVisits: {}", e);
                vec![]
            }
        }
    }

    async fn save(&self, visit: DoctorVisit) -> Result<DoctorVisit, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let new_entity = NewDoctorVisitEntity::from(&visit);
        let visit_id = visit.id;
        let member_id_str = visit.health_member_id.to_string();
        let user_id_str = visit.user_id.to_string();

        // Re-check active member in the same transaction as INSERT so a
        // concurrent deactivate cannot leave a new visit on an inactive member.
        let result = conn
            .interact(move |conn| {
                // IMMEDIATE locks the DB writer so deactivate cannot interleave
                // between the active check and the INSERT.
                conn.immediate_transaction(|conn| {
                    ensure_member_active(conn, &member_id_str, &user_id_str)?;
                    diesel::insert_into(doctor_visits::table)
                        .values(&new_entity)
                        .returning(DoctorVisitEntity::as_returning())
                        .get_result(conn)
                        .map_err(WriteTxError::from)
                })
            })
            .await;

        match result {
            Ok(Ok(entity)) => entity
                .into_domain()
                .ok_or_else(|| "Failed to map saved DoctorVisit".into()),
            Ok(Err(e)) => Err(map_write_error("saving", visit_id, e)),
            Err(e) => {
                tracing::error!("Error saving DoctorVisit {}: {}", visit_id, e);
                Err(Box::new(e))
            }
        }
    }

    async fn update(&self, visit: DoctorVisit) -> Result<DoctorVisit, Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let visit_id = visit.id;
        let id_str = visit.id.to_string();
        let member_id_str = visit.health_member_id.to_string();
        let user_id_str = visit.user_id.to_string();
        let update_entity = UpdateDoctorVisitEntity::from(&visit);
        let visit_for_return = visit.clone();

        // Re-check active member in the same transaction as UPDATE.
        // Map 0 rows (removed after load) to MissingDoctorVisit.
        let result = conn
            .interact(move |conn| {
                conn.immediate_transaction(|conn| {
                    ensure_member_active(conn, &member_id_str, &user_id_str)?;
                    let rows = diesel::update(
                        doctor_visits::table
                            .filter(doctor_visits::id.eq(&id_str))
                            .filter(doctor_visits::user_id.eq(&user_id_str)),
                    )
                    .set(&update_entity)
                    .execute(conn)?;
                    if rows == 0 {
                        return Err(WriteTxError::VisitMissing);
                    }
                    Ok(())
                })
            })
            .await;

        match result {
            Ok(Ok(())) => Ok(visit_for_return),
            Ok(Err(e)) => Err(map_write_error("updating", visit_id, e)),
            Err(e) => {
                tracing::error!("Error updating DoctorVisit {}: {}", visit_id, e);
                Err(Box::new(e))
            }
        }
    }

    async fn delete(
        &self,
        id: &DoctorVisitId,
        user_id: &Uuid,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.pool.get().await?;
        let id_str = id.to_string();
        let user_id_str = user_id.to_string();

        let result = conn
            .interact(move |conn| -> QueryResult<usize> {
                diesel::delete(
                    doctor_visits::table
                        .filter(doctor_visits::id.eq(id_str))
                        .filter(doctor_visits::user_id.eq(user_id_str)),
                )
                .execute(conn)
            })
            .await;

        match result {
            Ok(Ok(rows)) if rows > 0 => Ok(()),
            Ok(Ok(_)) => Err(Box::new(MissingDoctorVisit)),
            Ok(Err(e)) => {
                tracing::error!("Error deleting DoctorVisit: {}", e);
                Err(Box::new(e))
            }
            Err(e) => {
                tracing::error!("Error deleting DoctorVisit: {}", e);
                Err(Box::new(e))
            }
        }
    }

    async fn load_owned(&self, id: &DoctorVisitId, user_id: &Uuid) -> Option<DoctorVisit> {
        let visit = self.get_by_id(id).await?;
        if visit.is_owned_by(user_id) {
            Some(visit)
        } else {
            tracing::warn!(
                "DoctorVisit {} is not owned by user {}. Access denied.",
                id,
                user_id
            );
            None
        }
    }
}
