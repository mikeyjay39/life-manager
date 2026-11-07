CREATE TABLE cars (
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

CREATE INDEX idx_cars_user_id ON cars(user_id);
CREATE INDEX idx_cars_user_id_active ON cars(user_id, active);
CREATE UNIQUE INDEX idx_cars_user_vin ON cars(user_id, vin) WHERE vin IS NOT NULL;
CREATE UNIQUE INDEX idx_cars_user_license_plate ON cars(user_id, license_plate) WHERE license_plate IS NOT NULL;
