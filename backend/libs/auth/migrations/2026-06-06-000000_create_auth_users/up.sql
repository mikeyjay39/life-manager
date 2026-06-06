CREATE TABLE auth_users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    tenant TEXT NOT NULL,
    active INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL
);
