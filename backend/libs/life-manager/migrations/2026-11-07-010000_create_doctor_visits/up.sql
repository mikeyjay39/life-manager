CREATE TABLE doctor_visits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    health_member_id TEXT NOT NULL,
    visited_on DATE NOT NULL,
    provider_name TEXT,
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_doctor_visits_member_visited_on
    ON doctor_visits(health_member_id, visited_on);

CREATE INDEX idx_doctor_visits_user_id ON doctor_visits(user_id);
CREATE INDEX idx_doctor_visits_health_member_id ON doctor_visits(health_member_id);
