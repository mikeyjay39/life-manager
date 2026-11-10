//! Helpers for integration tests in `backend/tests/`. Not used in production handlers.

use std::sync::Arc;

use anyhow::Context;
use chrono::Utc;
use deadpool_diesel::sqlite::Pool;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
use uuid::Uuid;

use crate::{
    domain::{
        auth_password_hasher::AuthPasswordHasher, email_token_purpose::EmailTokenPurpose,
        email_token_service::EmailTokenService,
    },
    infrastructure::{
        argon_password_hasher::ArgonPasswordHasher, auth_user_entity::NewAuthUserEntity,
        email_token_orm_collection::EmailTokenOrmCollection,
        sha256_token_hasher::{OsRngOpaqueTokenGenerator, Sha256TokenHasher},
    },
    schema::auth_users,
};

pub async fn insert_auth_user(
    pool: &Arc<Pool>,
    username: &str,
    password: &str,
    tenant: &str,
    active: bool,
) -> anyhow::Result<Uuid> {
    let user_id = Uuid::new_v4();
    let hasher = ArgonPasswordHasher;
    let new_user = NewAuthUserEntity {
        id: user_id.to_string(),
        username: username.to_string(),
        password_hash: hasher.hash_password(password)?,
        tenant: tenant.to_string(),
        active,
        created_at: Utc::now().naive_utc(),
    };

    let conn = pool
        .get()
        .await
        .context("Failed to get database connection from pool")?;
    conn.interact(move |conn| diesel::insert_into(auth_users::table).values(&new_user).execute(conn))
        .await
        .map_err(|err| anyhow::anyhow!("Failed to insert auth user: {err:?}"))?
        .context("Database error inserting auth user")?;

    Ok(user_id)
}

pub async fn set_user_active(
    pool: &Arc<Pool>,
    username: &str,
    active: bool,
) -> anyhow::Result<()> {
    let username = username.to_string();
    let conn = pool
        .get()
        .await
        .context("Failed to get database connection from pool")?;
    conn.interact(move |conn| {
        diesel::update(auth_users::table.filter(auth_users::username.eq(username)))
            .set(auth_users::active.eq(active))
            .execute(conn)
    })
    .await
    .map_err(|err| anyhow::anyhow!("Failed to update auth user active flag: {err:?}"))?
    .context("Database error updating auth user active flag")?;
    Ok(())
}

/// Issue a raw `password_reset` token for integration/confirm tests.
pub async fn issue_password_reset_token(
    pool: &Arc<Pool>,
    user_id: Uuid,
    tenant: &str,
) -> anyhow::Result<String> {
    let service = EmailTokenService {
        repository: Arc::new(EmailTokenOrmCollection::new(pool.clone())),
        hasher: Arc::new(Sha256TokenHasher),
        generator: Arc::new(OsRngOpaqueTokenGenerator),
    };
    service
        .issue(user_id, tenant, EmailTokenPurpose::PasswordReset)
        .await
        .map_err(|err| anyhow::anyhow!("Failed to issue password-reset token: {err:?}"))
}

/// Read the stored password hash for a username (test assertions only).
pub async fn get_password_hash(pool: &Arc<Pool>, username: &str) -> anyhow::Result<String> {
    let username = username.to_string();
    let conn = pool
        .get()
        .await
        .context("Failed to get database connection from pool")?;
    let hash = conn
        .interact(move |conn| {
            auth_users::table
                .filter(auth_users::username.eq(username))
                .select(auth_users::password_hash)
                .first::<String>(conn)
        })
        .await
        .map_err(|err| anyhow::anyhow!("Failed to read password hash: {err:?}"))?
        .context("Database error reading password hash")?;
    Ok(hash)
}

/// Count unused password-reset tokens for a user (integration assertions).
pub async fn count_unused_password_reset_tokens(
    pool: &Arc<Pool>,
    user_id: Uuid,
) -> anyhow::Result<i64> {
    use crate::schema::auth_email_tokens;
    use diesel::dsl::count_star;

    let user_id_str = user_id.to_string();
    let purpose = EmailTokenPurpose::PasswordReset.as_str().to_string();
    let conn = pool
        .get()
        .await
        .context("Failed to get database connection from pool")?;
    let count = conn
        .interact(move |conn| {
            auth_email_tokens::table
                .filter(auth_email_tokens::user_id.eq(user_id_str))
                .filter(auth_email_tokens::purpose.eq(purpose))
                .filter(auth_email_tokens::consumed_at.is_null())
                .select(count_star())
                .first::<i64>(conn)
        })
        .await
        .map_err(|err| anyhow::anyhow!("Failed to count tokens: {err:?}"))?
        .context("Database error counting tokens")?;
    Ok(count)
}
