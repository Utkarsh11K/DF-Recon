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

CREATE TABLE IF NOT EXISTS app_files (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(255) REFERENCES app_batches(id) ON DELETE CASCADE,
    file_type VARCHAR(50),
    file_name VARCHAR(255),
    file_path VARCHAR(500)
);

-- Note: recon_runs and recon_summary_metrics tables exist or will be created by other scripts,
-- but we define basic versions here if they don't exist yet, to ensure no errors.
CREATE TABLE IF NOT EXISTS recon_runs (
    recon_run_id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(50),
    wave_id VARCHAR(50),
    opco_id VARCHAR(50),
    module_id VARCHAR(50),
    entity_id VARCHAR(50),
    execution_timestamp VARCHAR(100),
    status VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS recon_summary_metrics (
    recon_run_id VARCHAR(255) PRIMARY KEY REFERENCES recon_runs(recon_run_id) ON DELETE CASCADE,
    source_records INT,
    transformed_records INT,
    load_file_records INT,
    fusion_records INT,
    matched_records INT,
    mismatched_records INT,
    total_exceptions INT
);
