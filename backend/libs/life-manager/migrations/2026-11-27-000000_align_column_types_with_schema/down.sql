-- Revert to INTEGER active, REAL height and weight, and nullable
-- documents.created_at. Same rebuild procedure and reasons as up.sql.

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE documents_new (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP,
    issued_date TIMESTAMP,
    expire_date TIMESTAMP,
    storage_provider TEXT,
    storage_share_id TEXT,
    storage_node_id TEXT,
    storage_filename TEXT,
    storage_mime_type TEXT
);
INSERT INTO documents_new (id, title, content, user_id, created_at, issued_date, expire_date, storage_provider, storage_share_id, storage_node_id, storage_filename, storage_mime_type)
SELECT id, title, content, user_id, created_at, issued_date, expire_date, storage_provider, storage_share_id, storage_node_id, storage_filename, storage_mime_type FROM documents;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_title ON documents(title);

CREATE TABLE health_members_new (
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
INSERT INTO health_members_new (id, user_id, display_name, birth_date, notes, active, created_at, updated_at, deactivated_at)
SELECT id, user_id, display_name, birth_date, notes, active, created_at, updated_at, deactivated_at FROM health_members;
DROP TABLE health_members;
ALTER TABLE health_members_new RENAME TO health_members;
CREATE INDEX idx_health_members_user_id ON health_members(user_id);
CREATE INDEX idx_health_members_user_id_active ON health_members(user_id, active);

CREATE TABLE health_readings_new (
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
INSERT INTO health_readings_new (id, user_id, health_member_id, recorded_on, height_cm, weight_kg, systolic_mm_hg, diastolic_mm_hg, heart_rate_bpm, notes, created_at, updated_at)
SELECT id, user_id, health_member_id, recorded_on, height_cm, weight_kg, systolic_mm_hg, diastolic_mm_hg, heart_rate_bpm, notes, created_at, updated_at FROM health_readings;
DROP TABLE health_readings;
ALTER TABLE health_readings_new RENAME TO health_readings;
CREATE UNIQUE INDEX idx_health_readings_member_recorded_on
    ON health_readings(health_member_id, recorded_on);
CREATE INDEX idx_health_readings_user_id ON health_readings(user_id);
CREATE INDEX idx_health_readings_health_member_id ON health_readings(health_member_id);

CREATE TABLE cars_new (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    vin TEXT,
    license_plate TEXT,
    notes TEXT,
    insurance_document_id TEXT,
    registration_document_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    deactivated_at TIMESTAMP
);
INSERT INTO cars_new (id, user_id, display_name, make, model, year, vin, license_plate, notes, insurance_document_id, registration_document_id, active, created_at, updated_at, deactivated_at)
SELECT id, user_id, display_name, make, model, year, vin, license_plate, notes, insurance_document_id, registration_document_id, active, created_at, updated_at, deactivated_at FROM cars;
DROP TABLE cars;
ALTER TABLE cars_new RENAME TO cars;
CREATE INDEX idx_cars_user_id ON cars(user_id);
CREATE INDEX idx_cars_user_id_active ON cars(user_id, active);
CREATE UNIQUE INDEX idx_cars_user_vin ON cars(user_id, vin) WHERE vin IS NOT NULL;
CREATE UNIQUE INDEX idx_cars_user_license_plate ON cars(user_id, license_plate) WHERE license_plate IS NOT NULL;

PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;
