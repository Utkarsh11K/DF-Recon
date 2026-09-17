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

-- app_files stores metadata and raw binary for source | target | enriched files linked to a batch.
CREATE TABLE IF NOT EXISTS app_files (
    id           VARCHAR(50)   PRIMARY KEY,
    project_id   VARCHAR(50)   REFERENCES app_projects(id) ON DELETE CASCADE,
    batch_id     VARCHAR(255)  REFERENCES app_batches(id)  ON DELETE CASCADE,
    file_role    VARCHAR(50),                              -- source | target | enriched | other
    file_name    VARCHAR(255)  NOT NULL,                   -- basename only e.g. Customers_Source.xlsx
    storage_path VARCHAR(1000) NOT NULL UNIQUE,            -- full canonical path, lookup key
    file_content BYTEA,
    file_size    BIGINT        NOT NULL DEFAULT 0,
    mime_type    VARCHAR(100),
    total_rows   INT           NOT NULL DEFAULT 0,         -- row count parsed at upload time
    uploaded_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_files_project  ON app_files(project_id);
CREATE INDEX IF NOT EXISTS idx_app_files_batch    ON app_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_app_files_path     ON app_files(storage_path);

-- app_source_rows stores every data row from a source file as JSONB.
-- One row in this table = one data row in the uploaded source Excel/CSV.
-- row_data keys are the column headers from the file.
CREATE TABLE IF NOT EXISTS app_source_rows (
    id         VARCHAR(50)  PRIMARY KEY,
    file_id    VARCHAR(50)  NOT NULL REFERENCES app_files(id)  ON DELETE CASCADE,
    batch_id   VARCHAR(255) NOT NULL REFERENCES app_batches(id) ON DELETE CASCADE,
    row_number INT          NOT NULL,
    row_data   JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_rows_file    ON app_source_rows(file_id);
CREATE INDEX IF NOT EXISTS idx_source_rows_batch   ON app_source_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_source_rows_data    ON app_source_rows USING GIN (row_data);

-- app_target_rows stores every data row from a target (Fusion extract) file as JSONB.
-- Same structure as app_source_rows — kept separate so source vs target is always unambiguous.
CREATE TABLE IF NOT EXISTS app_target_rows (
    id         VARCHAR(50)  PRIMARY KEY,
    file_id    VARCHAR(50)  NOT NULL REFERENCES app_files(id)  ON DELETE CASCADE,
    batch_id   VARCHAR(255) NOT NULL REFERENCES app_batches(id) ON DELETE CASCADE,
    row_number INT          NOT NULL,
    row_data   JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_target_rows_file    ON app_target_rows(file_id);
CREATE INDEX IF NOT EXISTS idx_target_rows_batch   ON app_target_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_target_rows_data    ON app_target_rows USING GIN (row_data);

-- app_fbdi_files stores FBDI / ADFBDI template files with a hard FK to app_batches.
-- Kept separate from app_files because FBDI files have extra Oracle-specific metadata.
CREATE TABLE IF NOT EXISTS app_fbdi_files (
    id            VARCHAR(50)   PRIMARY KEY,
    batch_id      VARCHAR(255)  NOT NULL REFERENCES app_batches(id)  ON DELETE CASCADE,
    project_id    VARCHAR(50)   NOT NULL REFERENCES app_projects(id) ON DELETE CASCADE,
    file_name     VARCHAR(255)  NOT NULL,                -- basename only e.g. UploadCustomersTemplate.xlsm
    storage_path  VARCHAR(1000) NOT NULL UNIQUE,         -- full path, dedup key
    file_content  BYTEA         NOT NULL,                -- actual binary stored in DB
    file_size     BIGINT        NOT NULL,
    mime_type     VARCHAR(100),
    template_type VARCHAR(20)   NOT NULL DEFAULT 'FBDI', -- FBDI | ADFBDI | HDL
    entity        VARCHAR(100),                          -- Customers | Suppliers | Employees etc.
    uploaded_at   TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fbdi_files_batch   ON app_fbdi_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_fbdi_files_project ON app_fbdi_files(project_id);
CREATE INDEX IF NOT EXISTS idx_fbdi_files_path    ON app_fbdi_files(storage_path);

-- app_fbdi_sheets stores one row per sheet inside an FBDI file.
CREATE TABLE IF NOT EXISTS app_fbdi_sheets (
    id           VARCHAR(50)  PRIMARY KEY,
    fbdi_file_id VARCHAR(50)  NOT NULL REFERENCES app_fbdi_files(id) ON DELETE CASCADE,
    sheet_name   VARCHAR(255) NOT NULL,
    row_count    INT          NOT NULL DEFAULT 0,
    is_primary   BOOLEAN      NOT NULL DEFAULT FALSE  -- TRUE for the main data sheet (e.g. Customers)
);

CREATE INDEX IF NOT EXISTS idx_fbdi_sheets_file ON app_fbdi_sheets(fbdi_file_id);

-- app_fbdi_columns stores one row per column header inside a sheet.
CREATE TABLE IF NOT EXISTS app_fbdi_columns (
    id             VARCHAR(50)  PRIMARY KEY,
    sheet_id       VARCHAR(50)  NOT NULL REFERENCES app_fbdi_sheets(id) ON DELETE CASCADE,
    column_name    VARCHAR(255) NOT NULL,
    column_order   INT          NOT NULL,
    column_group   VARCHAR(255),                      -- row-4 group label e.g. "Organization"
    is_required    BOOLEAN      NOT NULL DEFAULT FALSE -- TRUE when header starts with *
);

CREATE INDEX IF NOT EXISTS idx_fbdi_columns_sheet ON app_fbdi_columns(sheet_id);

CREATE TABLE IF NOT EXISTS recon_runs (
    recon_run_id        VARCHAR(255) PRIMARY KEY,
    batch_id            VARCHAR(255) REFERENCES app_batches(id) ON DELETE SET NULL,
    project_id          VARCHAR(50),
    wave_id             VARCHAR(50),
    opco_id             VARCHAR(50),
    module_id           VARCHAR(50),
    entity_id           VARCHAR(50),
    execution_timestamp VARCHAR(100),
    status              VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_recon_runs_batch ON recon_runs(batch_id);

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Dynamic Data Tables: registry of per-file/per-sheet tables created at upload
-- ═══════════════════════════════════════════════════════════════════════════════

-- Each uploaded file+sheet gets its own PG table (e.g. data_file_abc_customers).
-- This registry tracks what was created so we can query/drop them later.
CREATE TABLE IF NOT EXISTS app_dynamic_tables (
    id              VARCHAR(50)   PRIMARY KEY,
    file_id         VARCHAR(50)   NOT NULL,               -- FK to app_files.id or app_fbdi_files.id
    file_role       VARCHAR(50)   NOT NULL,               -- source | target | fbdi | enriched | other
    batch_id        VARCHAR(255),
    project_id      VARCHAR(50),
    sheet_name      VARCHAR(255)  NOT NULL,
    pg_table_name   VARCHAR(255)  NOT NULL UNIQUE,        -- actual PG table e.g. data_file_abc_customers
    row_count       INT           NOT NULL DEFAULT 0,
    column_count    INT           NOT NULL DEFAULT 0,
    columns_json    JSONB         NOT NULL DEFAULT '[]',  -- [{name, pg_name, pg_type, nullable, is_pk_candidate}]
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dyn_tables_file    ON app_dynamic_tables(file_id);
CREATE INDEX IF NOT EXISTS idx_dyn_tables_batch   ON app_dynamic_tables(batch_id);
CREATE INDEX IF NOT EXISTS idx_dyn_tables_project ON app_dynamic_tables(project_id);

-- FK relationships detected between sibling dynamic tables (same file).
CREATE TABLE IF NOT EXISTS app_dynamic_fks (
    id              VARCHAR(50)   PRIMARY KEY,
    parent_table_id VARCHAR(50)   NOT NULL REFERENCES app_dynamic_tables(id) ON DELETE CASCADE,
    child_table_id  VARCHAR(50)   NOT NULL REFERENCES app_dynamic_tables(id) ON DELETE CASCADE,
    parent_column   VARCHAR(255)  NOT NULL,
    child_column    VARCHAR(255)  NOT NULL,
    match_rate      FLOAT         NOT NULL DEFAULT 0.0,   -- fraction of child values found in parent
    constraint_name VARCHAR(255),                          -- actual PG constraint name
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dyn_fks_parent ON app_dynamic_fks(parent_table_id);
CREATE INDEX IF NOT EXISTS idx_dyn_fks_child  ON app_dynamic_fks(child_table_id);
