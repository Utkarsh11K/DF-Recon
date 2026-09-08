-- =====================================================================
-- LightSpeed Data Conversion & Reconciliation Automation Platform
-- Comprehensive Database Schema DDL & Seed Script (14 Tables)
-- =====================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- 1. PROJECTS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    project_id SERIAL PRIMARY KEY,
    project_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. WAVES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waves (
    wave_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    wave_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_wave_per_project UNIQUE (project_id, wave_name)
);

-- ---------------------------------------------------------------------
-- 3. OPCOS (OPERATING COMPANIES / BUSINESS UNITS) TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opcos (
    opco_id SERIAL PRIMARY KEY,
    wave_id INT NOT NULL REFERENCES waves(wave_id) ON DELETE CASCADE,
    opco_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_opco_per_wave UNIQUE (wave_id, opco_name)
);

-- ---------------------------------------------------------------------
-- 4. MODULES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
    module_id SERIAL PRIMARY KEY,
    module_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 5. ENTITIES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entities (
    entity_id SERIAL PRIMARY KEY,
    module_id INT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    entity_name VARCHAR(100) NOT NULL,
    primary_key_column VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_entity_per_module UNIQUE (module_id, entity_name)
);

-- ---------------------------------------------------------------------
-- 6. SUB_ENTITIES TABLE (OPTIONAL)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sub_entities (
    sub_entity_id SERIAL PRIMARY KEY,
    entity_id INT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    sub_entity_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_sub_entity_per_entity UNIQUE (entity_id, sub_entity_name)
);

-- ---------------------------------------------------------------------
-- 7. CONVERSION_STAGES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversion_stages (
    stage_id SERIAL PRIMARY KEY,
    stage_code VARCHAR(50) NOT NULL UNIQUE,
    stage_name VARCHAR(100) NOT NULL,
    sequence_order INT NOT NULL,
    description TEXT
);

-- ---------------------------------------------------------------------
-- 8. RECON_RUNS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recon_runs (
    recon_run_id VARCHAR(100) PRIMARY KEY, -- Execution timestamp string e.g. 20260902143000 or UUID
    project_id INT NOT NULL REFERENCES projects(project_id),
    wave_id INT NOT NULL REFERENCES waves(wave_id),
    opco_id INT NOT NULL REFERENCES opcos(opco_id),
    module_id INT NOT NULL REFERENCES modules(module_id),
    entity_id INT NOT NULL REFERENCES entities(entity_id),
    sub_entity_id INT REFERENCES sub_entities(sub_entity_id),
    execution_timestamp VARCHAR(30) NOT NULL,
    status VARCHAR(30) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, FAILED, BLOCKED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 9. FILE_INVENTORY TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_inventory (
    file_id SERIAL PRIMARY KEY,
    recon_run_id VARCHAR(100) NOT NULL REFERENCES recon_runs(recon_run_id) ON DELETE CASCADE,
    stage_code VARCHAR(50) NOT NULL REFERENCES conversion_stages(stage_code),
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    file_exists BOOLEAN DEFAULT FALSE,
    file_size_bytes BIGINT DEFAULT 0,
    record_count INT DEFAULT 0,
    system_status VARCHAR(30) DEFAULT 'PENDING', -- PASS, WARNING, FAIL, PENDING, NOT_APPLICABLE
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_file_per_run_stage UNIQUE (recon_run_id, stage_code)
);

-- ---------------------------------------------------------------------
-- 10. FILE_VALIDATIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_validations (
    validation_id SERIAL PRIMARY KEY,
    file_id INT NOT NULL REFERENCES file_inventory(file_id) ON DELETE CASCADE,
    check_name VARCHAR(100) NOT NULL, -- FILE_EXISTENCE, FILE_SIZE, RECORD_COUNT, REQUIRED_COLUMNS, DUPLICATE_CHECK, NULL_CHECK
    status VARCHAR(30) NOT NULL, -- PASS, WARNING, FAIL
    message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 11. BUSINESS_RULES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_rules (
    rule_id VARCHAR(50) PRIMARY KEY, -- e.g. CUS001, CUS002
    entity_id INT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    rule_name VARCHAR(150) NOT NULL,
    condition_expression TEXT,
    logic_expression TEXT,
    severity VARCHAR(20) DEFAULT 'ERROR', -- ERROR, WARNING, INFO
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 12. RULE_EXECUTIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rule_executions (
    execution_id SERIAL PRIMARY KEY,
    recon_run_id VARCHAR(100) NOT NULL REFERENCES recon_runs(recon_run_id) ON DELETE CASCADE,
    rule_id VARCHAR(50) NOT NULL REFERENCES business_rules(rule_id),
    business_key VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL, -- PASS, FAIL, SKIPPED
    details TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 13. RECON_EXCEPTIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recon_exceptions (
    exception_id VARCHAR(50) PRIMARY KEY, -- e.g. EX001, EX002
    recon_run_id VARCHAR(100) NOT NULL REFERENCES recon_runs(recon_run_id) ON DELETE CASCADE,
    entity_id INT NOT NULL REFERENCES entities(entity_id),
    business_key VARCHAR(100) NOT NULL,
    stage_code VARCHAR(50) REFERENCES conversion_stages(stage_code),
    exception_type VARCHAR(100) NOT NULL, -- MISSING_ADDRESS, RECORD_MISSING, LOAD_FAILED, MISMATCH, DUPLICATE
    column_name VARCHAR(100),
    source_value TEXT,
    target_value TEXT,
    severity VARCHAR(20) DEFAULT 'HIGH', -- HIGH, MEDIUM, LOW
    status VARCHAR(30) DEFAULT 'OPEN', -- OPEN, RESOLVED, IGNORED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 14. RECON_SUMMARY_METRICS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recon_summary_metrics (
    metric_id SERIAL PRIMARY KEY,
    recon_run_id VARCHAR(100) NOT NULL UNIQUE REFERENCES recon_runs(recon_run_id) ON DELETE CASCADE,
    source_records INT DEFAULT 0,
    transformed_records INT DEFAULT 0,
    load_file_records INT DEFAULT 0,
    fusion_records INT DEFAULT 0,
    matched_records INT DEFAULT 0,
    mismatched_records INT DEFAULT 0,
    total_exceptions INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_recon_runs_status ON recon_runs(status);
CREATE INDEX IF NOT EXISTS idx_file_inventory_run ON file_inventory(recon_run_id);
CREATE INDEX IF NOT EXISTS idx_recon_exceptions_run ON recon_exceptions(recon_run_id);
CREATE INDEX IF NOT EXISTS idx_recon_exceptions_key ON recon_exceptions(business_key);
CREATE INDEX IF NOT EXISTS idx_rule_executions_run ON rule_executions(recon_run_id);

-- =====================================================================
-- INITIAL SEED DATA FOR LIGHTSPEED PLATFORM
-- =====================================================================

-- 1. Conversion Stages
INSERT INTO conversion_stages (stage_code, stage_name, sequence_order, description) VALUES
('01_SOURCE', 'Source Raw Extract', 1, 'Raw extract files from legacy source systems'),
('02_TRANSFORMED', 'Transformed / Enriched Data', 2, 'Staging data after normalization and business rules applied'),
('03_LOAD_FILE', 'FBDI / HDL / REST API Load File', 3, 'Payload files generated for Oracle Fusion load'),
('04_ERP_EXTRACT', 'Oracle Fusion ERP Extract', 4, 'Data extracted back from Oracle Fusion after import'),
('05_RECON', 'Reconciliation Report Output', 5, 'Final level 1-3 reconciliation results and template report')
ON CONFLICT (stage_code) DO NOTHING;

-- 2. Projects
INSERT INTO projects (project_id, project_name, description) VALUES
(1, 'Oracle_Fusion_Conversion', 'Oracle Fusion Data Conversion & Reconciliation Automation Project')
ON CONFLICT (project_name) DO NOTHING;

-- 3. Waves
INSERT INTO waves (wave_id, project_id, wave_name, description) VALUES
(1, 1, 'Wave_1', 'Wave 1 Initial Migration Wave'),
(2, 1, 'Wave_2', 'Wave 2 Secondary Migration Wave')
ON CONFLICT (project_id, wave_name) DO NOTHING;

-- 4. OpCos
INSERT INTO opcos (opco_id, wave_id, opco_name, description) VALUES
(1, 1, 'NOVIA', 'Novia Corporation Operating Company'),
(2, 1, 'AIRETECH', 'Airetech Operating Company'),
(3, 1, 'CJBS', 'CJBS Operating Company')
ON CONFLICT (wave_id, opco_name) DO NOTHING;

-- 5. Modules
INSERT INTO modules (module_id, module_name, description) VALUES
(1, 'Receivables', 'Accounts Receivable & Customer Data Module'),
(2, 'Payables', 'Accounts Payable & Supplier Data Module'),
(3, 'HCM', 'Human Capital Management & Worker Data Module'),
(4, 'Projects', 'Project Financials & Accounting Module')
ON CONFLICT (module_name) DO NOTHING;

-- 6. Entities
INSERT INTO entities (entity_id, module_id, entity_name, primary_key_column, description) VALUES
(1, 1, 'Customer', 'CUST_NO', 'Customer Account & Site Master Data'),
(2, 2, 'Supplier', 'SUPP_NO', 'Supplier Master & Site Data'),
(3, 3, 'Worker', 'EMP_NO', 'Employee & Worker Master Data'),
(4, 4, 'Project', 'PROJ_NO', 'Project Financial Master Data')
ON CONFLICT (module_id, entity_name) DO NOTHING;

-- 7. Sub-Entities
INSERT INTO sub_entities (sub_entity_id, entity_id, sub_entity_name, description) VALUES
(1, 1, 'Customer_Site', 'Customer Address & Site Details'),
(2, 1, 'Customer_Contact', 'Customer Contact Person Details')
ON CONFLICT (entity_id, sub_entity_name) DO NOTHING;

-- 8. Customer Business Rules (Pre-configured as per BRD Sec 8.3)
INSERT INTO business_rules (rule_id, entity_id, rule_name, condition_expression, logic_expression, severity) VALUES
('CUS001', 1, 'ADDRESS_REQUIRED', 'ADDRESS_LINE_1 IS NOT NULL', NULL, 'ERROR'),
('CUS002', 1, 'ACCOUNT_DESCRIPTION', NULL, 'ACCOUNT_DESCRIPTION = CUSTOMER_NAME', 'ERROR'),
('CUS003', 1, 'BILL_TO_REQUIRED', NULL, 'BILL_TO = Y', 'ERROR'),
('CUS004', 1, 'SHIP_TO_REQUIRED', NULL, 'SHIP_TO = Y', 'ERROR')
ON CONFLICT (rule_id) DO NOTHING;

-- Reset Sequences to align with inserted IDs
SELECT setval('projects_project_id_seq', (SELECT MAX(project_id) FROM projects));
SELECT setval('waves_wave_id_seq', (SELECT MAX(wave_id) FROM waves));
SELECT setval('opcos_opco_id_seq', (SELECT MAX(opco_id) FROM opcos));
SELECT setval('modules_module_id_seq', (SELECT MAX(module_id) FROM modules));
SELECT setval('entities_entity_id_seq', (SELECT MAX(entity_id) FROM entities));
SELECT setval('sub_entities_sub_entity_id_seq', (SELECT MAX(sub_entity_id) FROM sub_entities));
SELECT setval('conversion_stages_stage_id_seq', (SELECT MAX(stage_id) FROM conversion_stages));
