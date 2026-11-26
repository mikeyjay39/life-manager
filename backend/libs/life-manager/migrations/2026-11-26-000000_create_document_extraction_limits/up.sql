CREATE TABLE document_extraction_limits (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    daily_limit_per_user INTEGER NOT NULL CHECK (daily_limit_per_user >= 0),
    max_file_bytes INTEGER NOT NULL CHECK (max_file_bytes > 0),
    max_pdf_pages INTEGER NOT NULL CHECK (max_pdf_pages > 0),
    updated_at TIMESTAMP NOT NULL
);

INSERT INTO document_extraction_limits (id, daily_limit_per_user, max_file_bytes, max_pdf_pages, updated_at)
VALUES (1, 20, 10485760, 5, CURRENT_TIMESTAMP);

CREATE TABLE document_extraction_usage (
    user_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 0),
    PRIMARY KEY (user_id, usage_date)
);
