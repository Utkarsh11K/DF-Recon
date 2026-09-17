-- DF-Recon Postgres Database Initialization

CREATE TABLE IF NOT EXISTS app_projects (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    root_path VARCHAR(500),
    status VARCHAR(50),
    tags TEXT
);

CREATE TABLE IF NOT EXISTS app_modules (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) REFERENCES app_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS app_entities (
    id VARCHAR(50) PRIMARY KEY,
    module_id VARCHAR(50) REFERENCES app_modules(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS app_batches (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(50) REFERENCES app_projects(id) ON DELETE CASCADE,
    module_id VARCHAR(50) REFERENCES app_modules(id) ON DELETE CASCADE,
    entity_id VARCHAR(50) REFERENCES app_entities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(500)
);

-- app_files stores the actual file binary (BYTEA) so files survive browser cache clears,
-- work across devices/team members, and are never lost on container restart.
CREATE TABLE IF NOT EXISTS app_files (
    id           VARCHAR(50)  PRIMARY KEY,
    project_id   VARCHAR(50),
    batch_id     VARCHAR(255),
    file_role    VARCHAR(50),                          -- source | target | enriched | fbdi | other
    file_name    VARCHAR(255) NOT NULL,
    storage_path VARCHAR(1000) NOT NULL UNIQUE,        -- canonical path used as lookup key
    file_content BYTEA        NOT NULL,                -- actual file bytes
    file_size    BIGINT       NOT NULL,
    mime_type    VARCHAR(100),
    uploaded_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_files_project  ON app_files(project_id);
CREATE INDEX IF NOT EXISTS idx_app_files_batch    ON app_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_app_files_path     ON app_files(storage_path);

CREATE TABLE IF NOT EXISTS recon_runs (
    recon_run_id       VARCHAR(255) PRIMARY KEY,
    project_id         VARCHAR(50),
    wave_id            VARCHAR(50),
    opco_id            VARCHAR(50),
    module_id          VARCHAR(50),
    entity_id          VARCHAR(50),
    execution_timestamp VARCHAR(100),
    status             VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS recon_summary_metrics (
    recon_run_id         VARCHAR(255) PRIMARY KEY REFERENCES recon_runs(recon_run_id) ON DELETE CASCADE,
    source_records       INT,
    transformed_records  INT,
    load_file_records    INT,
    fusion_records       INT,
    matched_records      INT,
    mismatched_records   INT,
    total_exceptions     INT
);
