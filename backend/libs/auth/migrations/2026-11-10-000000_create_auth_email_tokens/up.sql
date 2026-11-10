CREATE TABLE auth_email_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES auth_users(id),
    tenant TEXT NOT NULL,
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_auth_email_tokens_user_purpose
    ON auth_email_tokens(user_id, purpose);

-- At most one unconsumed token per user+purpose (enforces invalidate-prior).
CREATE UNIQUE INDEX idx_auth_email_tokens_one_active
    ON auth_email_tokens(user_id, purpose)
    WHERE consumed_at IS NULL;
