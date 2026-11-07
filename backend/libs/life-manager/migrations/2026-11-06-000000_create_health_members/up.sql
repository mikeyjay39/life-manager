CREATE TABLE health_members (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    birth_date DATE,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    deactivated_at TIMESTAMP
);

CREATE INDEX idx_health_members_user_id ON health_members(user_id);
CREATE INDEX idx_health_members_user_id_active ON health_members(user_id, active);
