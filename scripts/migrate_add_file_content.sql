-- Migration: upgrade app_files to store actual file content in PostgreSQL
-- Run once on any existing database that was initialized before this change.

ALTER TABLE app_files ADD COLUMN IF NOT EXISTS project_id   VARCHAR(50);
ALTER TABLE app_files ADD COLUMN IF NOT EXISTS file_role    VARCHAR(50);
ALTER TABLE app_files ADD COLUMN IF NOT EXISTS storage_path VARCHAR(1000);
ALTER TABLE app_files ADD COLUMN IF NOT EXISTS file_content BYTEA;
ALTER TABLE app_files ADD COLUMN IF NOT EXISTS file_size    BIGINT;
ALTER TABLE app_files ADD COLUMN IF NOT EXISTS mime_type    VARCHAR(100);
ALTER TABLE app_files ADD COLUMN IF NOT EXISTS uploaded_at  TIMESTAMP DEFAULT NOW();

-- Rename old file_path to storage_path if storage_path column was just added empty
UPDATE app_files SET storage_path = file_path WHERE storage_path IS NULL AND file_path IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_files_path    ON app_files(storage_path) WHERE storage_path IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_app_files_project ON app_files(project_id);
CREATE INDEX        IF NOT EXISTS idx_app_files_batch   ON app_files(batch_id);
