CREATE TABLE car_maintenance_events (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    occurred_on DATE NOT NULL,
    event_type TEXT NOT NULL,
    odometer_miles INTEGER,
    cost_cents BIGINT,
    title TEXT,
    notes TEXT,
    document_id TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_car_maintenance_events_car_occurred_on
    ON car_maintenance_events(car_id, occurred_on);

CREATE INDEX idx_car_maintenance_events_user_id
    ON car_maintenance_events(user_id);

CREATE INDEX idx_car_maintenance_events_car_id
    ON car_maintenance_events(car_id);
