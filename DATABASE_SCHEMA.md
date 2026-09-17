# DF-Recon — Database Schema Design

> PostgreSQL database: `lightspeed_db`
> User: `lightspeed_user` | Port: `5432` | Container: `df-recon-postgres`

---

## Why This Design

DF-Recon is a **reconciliation tool**. Its core job is:

```
Source file rows  ←→  FBDI template columns  ←→  Target (Fusion extract) rows
```

To do that comparison properly in SQL — without loading entire files into RAM every time — the row data from source and target files must be stored relationally. The FBDI template binary is kept as BYTEA because it is a load file sent to Oracle, not compared row-by-row; only its sheet and column metadata is stored relationally.

---

## Complete Table List (10 tables)

| Table | Purpose |
|---|---|
| `app_projects` | Top-level project (e.g. Airetech Wave 1D) |
| `app_modules` | Module inside a project (e.g. 03_Order Management) |
| `app_entities` | Entity inside a module (e.g. 04_Customers) |
| `app_batches` | One batch per entity — the unit of reconciliation |
| `app_files` | Metadata for source / target files (no binary) |
| `app_source_rows` | Every data row from a source file as JSONB |
| `app_target_rows` | Every data row from a target (Fusion extract) file as JSONB |
| `app_fbdi_files` | FBDI template binary (BYTEA) + Oracle metadata |
| `app_fbdi_sheets` | One row per data sheet inside an FBDI file |
| `app_fbdi_columns` | One row per column header inside an FBDI sheet |

Plus two reconciliation result tables:

| Table | Purpose |
|---|---|
| `recon_runs` | One row per reconciliation execution |
| `recon_summary_metrics` | Aggregate counts for a recon run |

---

## Full Relation Chain

```
app_projects
    └── app_modules          (FK → app_projects)
        └── app_entities     (FK → app_modules)
            └── app_batches  (FK → app_projects, app_modules, app_entities)
                │
                ├── app_files            (FK → app_batches, app_projects)
                │   ├── app_source_rows  (FK → app_files, app_batches)
                │   └── app_target_rows  (FK → app_files, app_batches)
                │
                ├── app_fbdi_files       (FK → app_batches, app_projects)
                │   └── app_fbdi_sheets  (FK → app_fbdi_files)
                │       └── app_fbdi_columns (FK → app_fbdi_sheets)
                │
                └── recon_runs           (FK → app_batches)
                    └── recon_summary_metrics (FK → recon_runs)
```

**Cascade rule:** Deleting a batch deletes all its files, rows, FBDI data, and recon runs automatically via `ON DELETE CASCADE`.

---

## Table Definitions

### `app_projects`
```sql
id          VARCHAR(50)   PRIMARY KEY
name        VARCHAR(255)  NOT NULL
description TEXT
root_path   VARCHAR(500)
status      VARCHAR(50)
tags        TEXT
```

### `app_modules`
```sql
id          VARCHAR(50)  PRIMARY KEY
project_id  VARCHAR(50)  FK → app_projects(id) ON DELETE CASCADE
name        VARCHAR(255) NOT NULL
```

### `app_entities`
```sql
id          VARCHAR(50)  PRIMARY KEY
module_id   VARCHAR(50)  FK → app_modules(id) ON DELETE CASCADE
name        VARCHAR(255) NOT NULL
```

### `app_batches`
```sql
id          VARCHAR(255) PRIMARY KEY
project_id  VARCHAR(50)  FK → app_projects(id) ON DELETE CASCADE
module_id   VARCHAR(50)  FK → app_modules(id)  ON DELETE CASCADE
entity_id   VARCHAR(50)  FK → app_entities(id) ON DELETE CASCADE
name        VARCHAR(255) NOT NULL
path        VARCHAR(500)
```

### `app_files` — metadata only, no binary
```sql
id           VARCHAR(50)   PRIMARY KEY
project_id   VARCHAR(50)   FK → app_projects(id) ON DELETE CASCADE
batch_id     VARCHAR(255)  FK → app_batches(id)  ON DELETE CASCADE
file_role    VARCHAR(50)                          -- source | target | enriched | other
file_name    VARCHAR(255)  NOT NULL
storage_path VARCHAR(1000) NOT NULL UNIQUE        -- full path on disk, dedup key
file_size    BIGINT        DEFAULT 0
mime_type    VARCHAR(100)
total_rows   INT           DEFAULT 0              -- row count stored at upload time
uploaded_at  TIMESTAMP     DEFAULT NOW()
```

> `file_content BYTEA` was intentionally removed. Row data lives in `app_source_rows` / `app_target_rows`.

### `app_source_rows` — one row per data row in a source file
```sql
id         VARCHAR(50)  PRIMARY KEY
file_id    VARCHAR(50)  FK → app_files(id)   ON DELETE CASCADE
batch_id   VARCHAR(255) FK → app_batches(id) ON DELETE CASCADE
row_number INT          NOT NULL
row_data   JSONB        NOT NULL
```
Indexes: `btree(file_id)`, `btree(batch_id)`, `GIN(row_data)`

### `app_target_rows` — one row per data row in a target (Fusion extract) file
```sql
id         VARCHAR(50)  PRIMARY KEY
file_id    VARCHAR(50)  FK → app_files(id)   ON DELETE CASCADE
batch_id   VARCHAR(255) FK → app_batches(id) ON DELETE CASCADE
row_number INT          NOT NULL
row_data   JSONB        NOT NULL
```
Indexes: `btree(file_id)`, `btree(batch_id)`, `GIN(row_data)`

### `app_fbdi_files` — FBDI template binary
```sql
id            VARCHAR(50)   PRIMARY KEY
batch_id      VARCHAR(255)  FK → app_batches(id)  ON DELETE CASCADE
project_id    VARCHAR(50)   FK → app_projects(id) ON DELETE CASCADE
file_name     VARCHAR(255)  NOT NULL
storage_path  VARCHAR(1000) NOT NULL UNIQUE
file_content  BYTEA         NOT NULL               -- full .xlsm binary
file_size     BIGINT        NOT NULL
mime_type     VARCHAR(100)
template_type VARCHAR(20)   DEFAULT 'FBDI'         -- FBDI | ADFBDI | HDL
entity        VARCHAR(100)                         -- Customers | Suppliers | Employees
uploaded_at   TIMESTAMP     DEFAULT NOW()
```

### `app_fbdi_sheets` — one row per data sheet in an FBDI file
```sql
id           VARCHAR(50)  PRIMARY KEY
fbdi_file_id VARCHAR(50)  FK → app_fbdi_files(id) ON DELETE CASCADE
sheet_name   VARCHAR(255) NOT NULL
row_count    INT          DEFAULT 0
is_primary   BOOLEAN      DEFAULT FALSE            -- TRUE for main sheet e.g. Customers
```

### `app_fbdi_columns` — one row per column header in an FBDI sheet
```sql
id           VARCHAR(50)  PRIMARY KEY
sheet_id     VARCHAR(50)  FK → app_fbdi_sheets(id) ON DELETE CASCADE
column_name  VARCHAR(255) NOT NULL
column_order INT          NOT NULL
column_group VARCHAR(255)                          -- row-4 group label e.g. "Organization"
is_required  BOOLEAN      DEFAULT FALSE            -- TRUE when header starts with *
```

### `recon_runs`
```sql
recon_run_id        VARCHAR(255) PRIMARY KEY
batch_id            VARCHAR(255) FK → app_batches(id) ON DELETE SET NULL
project_id          VARCHAR(50)
module_id           VARCHAR(50)
entity_id           VARCHAR(50)
execution_timestamp VARCHAR(100)
status              VARCHAR(50)
```

### `recon_summary_metrics`
```sql
recon_run_id        VARCHAR(255) PRIMARY KEY FK → recon_runs(recon_run_id) ON DELETE CASCADE
source_records      INT
transformed_records INT
load_file_records   INT
fusion_records      INT
matched_records     INT
mismatched_records  INT
total_exceptions    INT
```

---

## How Data Is Stored — With Real Examples

### Example: Uploading a Source File with 5 Rows

**File:** `Airetech_Customers_Source.xlsx`
**Batch:** `proj_1866f75d_03_Order Management_04_Customers`

**Step 1 — `app_files` gets one metadata row (no binary):**

```
id           │ file_a1b2c3d4
project_id   │ proj_1866f75d
batch_id     │ proj_1866f75d_03_Order Management_04_Customers
file_role    │ source
file_name    │ Airetech_Customers_Source.xlsx
storage_path │ /app/uploads/01-Source/Airetech_Customers_Source.xlsx
file_size    │ 24576
total_rows   │ 5
uploaded_at  │ 2026-09-15 10:30:00
```

**Step 2 — `app_source_rows` gets 5 rows, one per data row:**

```
id        │ file_id      │ batch_id                                        │ row_number │ row_data
──────────┼──────────────┼─────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────────────
row_001   │ file_a1b2c3  │ proj_1866f75d_03_Order Management_04_Customers  │ 1          │ {"Account Number":"CUST001","Customer Name":"Airetech Ltd","Country":"US","Email":"a@air.com"}
row_002   │ file_a1b2c3  │ proj_1866f75d_03_Order Management_04_Customers  │ 2          │ {"Account Number":"CUST002","Customer Name":"Lightspeed Inc","Country":"UK","Email":"b@ls.com"}
row_003   │ file_a1b2c3  │ proj_1866f75d_03_Order Management_04_Customers  │ 3          │ {"Account Number":"CUST003","Customer Name":"Oracle Corp","Country":"US","Email":"c@ora.com"}
row_004   │ file_a1b2c3  │ proj_1866f75d_03_Order Management_04_Customers  │ 4          │ {"Account Number":"CUST004","Customer Name":"Infosys Ltd","Country":"IN","Email":"d@inf.com"}
row_005   │ file_a1b2c3  │ proj_1866f75d_03_Order Management_04_Customers  │ 5          │ {"Account Number":"CUST005","Customer Name":"TCS Global","Country":"IN","Email":"e@tcs.com"}
```

---

### Example: Uploading a Target (Fusion Extract) File with 4 Rows

**File:** `Airetech_Fusion_Extract.xlsx` — Oracle loaded 4 of the 5 customers (CUST005 missing)

**`app_files` gets one metadata row:**

```
id           │ file_b3c4d5e6
file_role    │ target
file_name    │ Airetech_Fusion_Extract.xlsx
total_rows   │ 4
```

**`app_target_rows` gets 4 rows:**

```
id        │ row_number │ row_data
──────────┼────────────┼──────────────────────────────────────────────────────────────────────────────
row_101   │ 1          │ {"Account Number":"CUST001","Customer Name":"Airetech Ltd","Country":"US"}
row_102   │ 2          │ {"Account Number":"CUST002","Customer Name":"Lightspeed Inc","Country":"GB"}   ← UK vs GB mismatch
row_103   │ 3          │ {"Account Number":"CUST003","Customer Name":"Oracle Corp","Country":"US"}
row_104   │ 4          │ {"Account Number":"CUST004","Customer Name":"Infosys","Country":"IN"}          ← name mismatch
```

CUST005 is not in `app_target_rows` at all — that is a `MISSING_IN_ORACLE` exception, visible directly in SQL.

---

### Example: Uploading an FBDI File with 3 Data Sheets

**File:** `UploadCustomersTemplateAiretech 1.xlsm`

**`app_fbdi_files` — one row, full binary stored:**

```
id            │ file_x9y8z7w6
batch_id      │ proj_1866f75d_03_Order Management_04_Customers
file_name     │ UploadCustomersTemplateAiretech 1.xlsm
file_content  │ <BYTEA — 1,318,863 bytes>
template_type │ ADFBDI
entity        │ Customers
```

**`app_fbdi_sheets` — one row per data sheet (LOV and Instructions skipped):**

```
id           │ fbdi_file_id   │ sheet_name          │ row_count │ is_primary
─────────────┼────────────────┼─────────────────────┼───────────┼───────────
sht_aa11bb22 │ file_x9y8z7w6  │ Customers           │ 5         │ TRUE
sht_cc33dd44 │ file_x9y8z7w6  │ Contacts            │ 3         │ FALSE
sht_ee55ff66 │ file_x9y8z7w6  │ Reference Accounts  │ 2         │ FALSE
```

**`app_fbdi_columns` — one row per column header (showing first 5 of 87 for Customers sheet):**

```
id        │ sheet_id     │ column_name      │ column_order │ column_group      │ is_required
──────────┼──────────────┼──────────────────┼──────────────┼───────────────────┼────────────
col_0001  │ sht_aa11bb22 │ Source System    │ 0            │ Organization      │ TRUE
col_0002  │ sht_aa11bb22 │ Account Number   │ 1            │ Customer Account  │ TRUE
col_0003  │ sht_aa11bb22 │ Registry ID      │ 2            │ Organization      │ FALSE
col_0004  │ sht_aa11bb22 │ Customer Name    │ 3            │ Customer Account  │ TRUE
col_0005  │ sht_aa11bb22 │ Address Line 1   │ 5            │ Account Address   │ TRUE
...       │ ...          │ ...              │ ...          │ ...               │ ...
col_0087  │ sht_aa11bb22 │ (87th column)    │ 86           │ ...               │ FALSE
```

---

## What Is and Is Not Stored in the Database

| Data | Stored? | Where | Why |
|---|---|---|---|
| Source file row data | YES | `app_source_rows` JSONB | Queryable for reconciliation |
| Target file row data | YES | `app_target_rows` JSONB | Queryable for reconciliation |
| Source/Target file binary | NO | — | Not needed once rows are in DB |
| Source/Target file metadata | YES | `app_files` | File name, size, row count |
| FBDI template binary | YES | `app_fbdi_files` BYTEA | Needed for download / re-upload to Oracle |
| FBDI sheet names + row counts | YES | `app_fbdi_sheets` | UI sheet list without reading binary |
| FBDI column names + groups | YES | `app_fbdi_columns` | UI column mapping dropdowns |
| FBDI row data (cell values) | NO | — | Not reconciled row-by-row |

---

## Reconciliation Queries — Pure SQL, No Pandas

Because source and target rows are stored as JSONB, reconciliation is SQL:

**Find rows in source missing from target (MISSING_IN_ORACLE):**
```sql
SELECT row_data->>'Account Number' AS missing_key
FROM app_source_rows
WHERE batch_id = 'proj_1866f75d_03_Order Management_04_Customers'
EXCEPT
SELECT row_data->>'Account Number'
FROM app_target_rows
WHERE batch_id = 'proj_1866f75d_03_Order Management_04_Customers';
-- Returns: CUST005
```

**Find field-level mismatches for matched keys:**
```sql
SELECT
    s.row_data->>'Account Number'  AS key,
    s.row_data->>'Customer Name'   AS source_name,
    t.row_data->>'Customer Name'   AS target_name,
    s.row_data->>'Country'         AS source_country,
    t.row_data->>'Country'         AS target_country
FROM app_source_rows s
JOIN app_target_rows t
    ON  t.batch_id   = s.batch_id
    AND t.row_data->>'Account Number' = s.row_data->>'Account Number'
WHERE s.batch_id = 'proj_1866f75d_03_Order Management_04_Customers'
  AND (
      s.row_data->>'Customer Name' != t.row_data->>'Customer Name'
   OR s.row_data->>'Country'       != t.row_data->>'Country'
  );
-- Returns: CUST002 (UK vs GB), CUST004 (Infosys Ltd vs Infosys)
```

**Count match summary:**
```sql
SELECT
    COUNT(*) FILTER (WHERE t.id IS NOT NULL)     AS matched,
    COUNT(*) FILTER (WHERE t.id IS NULL)         AS missing_in_oracle,
    (SELECT COUNT(*) FROM app_target_rows WHERE batch_id = s.batch_id
     AND row_data->>'Account Number' NOT IN (
         SELECT row_data->>'Account Number' FROM app_source_rows WHERE batch_id = s.batch_id
     ))                                          AS extra_in_oracle
FROM app_source_rows s
LEFT JOIN app_target_rows t
    ON  t.batch_id = s.batch_id
    AND t.row_data->>'Account Number' = s.row_data->>'Account Number'
WHERE s.batch_id = 'proj_1866f75d_03_Order Management_04_Customers'
GROUP BY s.batch_id;
-- Returns: matched=4, missing_in_oracle=1, extra_in_oracle=0
```

---

## How `register_file()` Works (Code Flow)

When a file is uploaded via the wizard or API:

```
POST /api/v1/discovery/upload-and-detect
    │
    ├── saves file to disk (01-Source/ or 04-Fusion/)
    │
    └── calls register_file(batch_id, file_type, file_name, file_path)
            │
            ├── reads file binary from disk
            │
            ├── if FBDI (.xlsm / .xlsx in 03-FBDI folder):
            │       INSERT INTO app_fbdi_files (binary BYTEA)
            │       → calls fbdi_parser.parse_and_store()
            │               DELETE old app_fbdi_sheets for this file
            │               for each data sheet (skip LOV, Instructions):
            │                   INSERT INTO app_fbdi_sheets (name, row_count, is_primary)
            │                   for each column in row 5:
            │                       INSERT INTO app_fbdi_columns (name, group, order, is_required)
            │
            ├── if SOURCE file:
            │       pandas.read_excel / read_csv → DataFrame
            │       INSERT INTO app_files (metadata, total_rows, NO binary)
            │       DELETE old app_source_rows for this batch
            │       for each DataFrame row:
            │           INSERT INTO app_source_rows (file_id, batch_id, row_number, row_data JSONB)
            │
            └── if TARGET file:
                    pandas.read_excel / read_csv → DataFrame
                    INSERT INTO app_files (metadata, total_rows, NO binary)
                    DELETE old app_target_rows for this batch
                    for each DataFrame row:
                        INSERT INTO app_target_rows (file_id, batch_id, row_number, row_data JSONB)
```

---

## FBDI File Structure (Oracle Fusion .xlsm)

The FBDI parser reads the file according to Oracle's fixed row layout:

```
Row 1  — empty
Row 2  — sheet title
Row 3  — "* Required" label row
Row 4  — column GROUP names (e.g. Organization, Customer Account, Account Address)
Row 5  — actual COLUMN HEADERS (headers prefixed with * are required fields)
Row 6+ — data rows (counted for row_count in app_fbdi_sheets)
```

Sheets skipped: `LOV`, `Instructions`
Primary sheet: `Customers` (`is_primary = TRUE`)
Join key across all sheets: `*Source System` + `*Account Number`
Site-level join: `*Source System` + `*Account Number` + `*Site Number`

---

## Cascade Delete Behaviour

```
DELETE FROM app_projects WHERE id = 'proj_1866f75d'
    → cascades to app_modules
        → cascades to app_entities
            → cascades to app_batches
                → cascades to app_files
                    → cascades to app_source_rows  (all 5 rows deleted)
                    → cascades to app_target_rows  (all 4 rows deleted)
                → cascades to app_fbdi_files
                    → cascades to app_fbdi_sheets
                        → cascades to app_fbdi_columns
                → recon_runs.batch_id SET NULL     (run history preserved)
```

---

## DB Credentials

```
Host:      localhost (or df-recon-postgres inside Docker network)
Port:      5432
Database:  lightspeed_db
User:      lightspeed_user
Passwor
```

Connect via Docker:
```bash
docker exec -it df-recon-postgres psql -U lightspeed_user -d lightspeed_db
```

Re-initialise schema from scratch:
```bash
docker exec -i df-recon-postgres psql -U lightspeed_user -d lightspeed_db < scripts/init.sql
```
