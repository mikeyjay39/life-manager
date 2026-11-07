CREATE TABLE health_readings (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    health_member_id TEXT NOT NULL,
    recorded_on DATE NOT NULL,
    height_cm REAL,
    weight_kg REAL,
    systolic_mm_hg INTEGER,
    diastolic_mm_hg INTEGER,
    heart_rate_bpm INTEGER,
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_health_readings_member_recorded_on
    ON health_readings(health_member_id, recorded_on);

CREATE INDEX idx_health_readings_user_id ON health_readings(user_id);
CREATE INDEX idx_health_readings_health_member_id ON health_readings(health_member_id);
