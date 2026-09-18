# DF-Recon — Merged Project

> **Full-Stack Oracle Fusion Data Reconciliation Tool**
> This folder is the **official merged version** combining code from both **Goraksha** and **Priti** branches into one complete, working project.

---

## 📁 Merge Source Map — File-by-File

Every file in this merged project is listed below with its exact source folder and the reason it was chosen or merged.

---

### 🗂️ Root Level Files

| File | Source | Why Taken From Here |
|------|--------|---------------------|
| `.env` | **Goraksha** | Contains complete environment variables: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `NEXT_PUBLIC_BACKEND_URL` |
| `.dockerignore` | **Priti** | Was missing in Goraksha's folder. Prevents unnecessary files (node_modules, .git, __pycache__) from being copied into Docker image |
| `.gitignore` | **Priti** | Was missing in Goraksha's folder. Prevents secrets, build artifacts, and temp files from being committed to Git |
| `AGENTS.md` | **Priti** | Was missing in Goraksha's folder. Documents agent/AI instructions for the project |
| `CLAUDE.md` | **Priti** | Was missing in Goraksha's folder. Claude AI configuration reference |
| `docker-compose.yml` | **Goraksha** | Same content in both. Defines services: `backend` (FastAPI) + `db` (PostgreSQL) |
| `Dockerfile` | **Priti** | Was missing in Goraksha's root. Builds the Next.js frontend Docker image |
| `README.md` | **NEW (Merged)** | Freshly written to document the complete merged project — both branches combined |

---

### 🐍 Backend — `backend/`

#### `backend/Dockerfile`
- **Source:** Both (identical)
- **Function:** Builds the Python FastAPI backend Docker image. Installs dependencies from `requirements.txt`, exposes port 8000.

#### `backend/requirements.txt`
- **Source:** Both (identical)
- **Function:** Lists all Python dependencies:
  - `fastapi`, `uvicorn` — API server
  - `pandas`, `openpyxl`, `xlrd` — Excel/CSV file reading
  - `pydantic` — Data validation & schemas
  - `psycopg2-binary`, `sqlalchemy` — PostgreSQL database
  - `pytest`, `httpx` — Testing

---

#### `backend/app/main.py` ✅ MERGED FROM BOTH
- **Source:** **MERGED** — Goraksha + Priti combined
- **What Goraksha contributed:**
  - `/api/v1/discovery/scan-folder` — Scans a local folder path recursively for files
  - `/api/v1/fusion/fbdi/validate` — Validates FBDI payloads
  - `/api/v1/fusion/extract/prepare` — Prepares Fusion extract + timestamp validation
  - `/api/v1/fusion/reconcile` — Runs the full reconciliation engine
  - `/api/v1/fusion/reconciliation/{run_id}` — Retrieves past recon run
  - `/api/v1/fusion/export-report/{run_id}` — Exports recon report as JSON or CSV
  - Imports: `FBDIParser`, `FusionExtractService`, `BackendReconciliationEngine`
- **What Priti contributed:**
  - `/api/v1/business-rules/core` — Lists core business rules (CUS001–CUS010) by entity
  - `/api/v1/business-rules/validate` — Runs core + dynamic business rules against uploaded file
  - Imports: `BusinessRuleEngine`, `get_core_rules`, `CORE_RULES_BY_ID`, `load_dataframe`
- **Common endpoints (both had):**
  - `GET /health`
  - `GET /api/v1/db/status`
  - `GET /api/v1/supported-formats`
  - `POST /api/v1/upload-file`
  - `POST /api/v1/discovery/upload-and-detect`
  - `POST /api/v1/validate-folder`
- **Total endpoints in merged version: 14**

---

### 🔧 Backend Engine — `backend/app/engine/`

#### `backend/app/engine/fbdi_hdl_parser.py`
- **Source:** **Goraksha only** (Priti did not have this file)
- **Functionality:**
  - Production-grade **FBDI (File-Based Data Import) Parser & Multi-Step Validator**
  - Supports Oracle Fusion Financials, SCM, HCM payloads
  - Accepts ZIP, CSV, XLSX file formats
  - Runs a **5-step validation pipeline:**
    1. **File Existence & Size check** — verifies file is not missing or empty
    2. **Structure Validation & Extraction** — reads inner CSV from ZIP, detects sheets in Excel
    3. **Record Count Validation** — fails if 0 records found
    4. **Primary Key Uniqueness Check** — auto-detects PK column (ID/NO/NUMBER/CODE/KEY), checks duplicates
    5. **Null Fields & Data Quality Check** — reports all columns with empty/null values
  - Returns full step-by-step result with PASS / FAIL / WARNING per step
  - Entity-aware: works for Customer, Supplier, HCM, and any future entity

---

### 📐 Backend Schemas — `backend/app/schemas/`

#### `backend/app/schemas/validation_schema.py`
- **Source:** **Goraksha** (richer, extended version chosen over Priti's basic version)
- **Why Goraksha's version:** Goraksha's schema has 8 more Pydantic models that Priti's didn't have
- **Pydantic models included:**
  - `SheetDetectionResult` — sheet name, record count, columns, **sample_data** (extra field vs Priti)
  - `FileDetectionResult` — file name, extension, size, type, sheets, inner_files
  - `ValidationStepResult` — step number, name, status (PASS/FAIL/WARNING/SKIPPED), details
  - `ValidationChainReport` — full folder + file + data validation report
  - `DiscoveryResponse` — batch_id, **folder_path** (extra), source/target file info, **discovered_files** (extra)
  - `FusionExtractPreparation` — *(Goraksha only)* timestamp matching result
  - `ReconciliationRequest` — *(Goraksha only)* full reconciliation job request
  - `FieldDifference` — *(Goraksha only)* field-level mismatch detail
  - `ReconciliationRecordDetail` — *(Goraksha only)* per-record discrepancy
  - `ColumnSummaryMetric` — *(Goraksha only)* column-level match/mismatch metrics
  - `ReconciliationReportResponse` — *(Goraksha only)* full reconciliation report with grade

#### `backend/app/schemas/business_rules_schema.py`
- **Source:** **Priti only** (Goraksha did not have this file)
- **Functionality:** Pydantic schemas for the Business Rules Engine
- **Models included:**
  - `BusinessRule` — rule_id, rule_name, entity, field, rule_type, severity, enabled, is_core
  - `RuleResult` — per-record pass/fail result with tag and failure_reason
  - `RuleSummary` — per-rule aggregate: pass_count, fail_count, status (PASS/FAIL/NOT_APPLICABLE/ERROR)
  - `BusinessRuleValidationRequest` — file_name, entity, primary_key_column, core_rule_ids, dynamic_rules
  - `BusinessValidationReport` — overall entity validation report

---

### ⚙️ Backend Services — `backend/app/services/`

#### `backend/app/services/file_detector.py`
- **Source:** **Goraksha** (larger, more complete — 200 lines vs Priti's 161 lines)
- **Functionality:**
  - Detects file type, extension, size, MIME type, encoding, delimiter
  - Reads all sheets in multi-sheet Excel workbooks
  - Handles: `.xlsx`, `.xls`, `.csv`, `.txt`, `.dat`, `.zip`, `.json`, `.xml`
  - Provides `FileDetectorService.is_supported_file()` and `detect_file_and_sheets()`
  - Goraksha's version additionally stores **sample_data rows** per sheet

#### `backend/app/services/validator_chain.py`
- **Source:** **Goraksha base + Priti's import added**
- **Goraksha contributed:** The full validation chain logic (278 lines):
  - Step 1: Folder existence check
  - Step 2: Supported file detection
  - Step 3: File-level validation (size, extension)
  - Step 4: Data validation (duplicates, nulls, required columns, primary key check)
  - Execution time tracking in milliseconds
- **Priti contributed:** Added `from app.services.file_loader import load_dataframe as _shared_load_dataframe`
  — connects the chain to the shared file loader so both engines read files the same way

#### `backend/app/services/file_loader.py`
- **Source:** **Priti only** (Goraksha did not have this file)
- **Functionality:**
  - Shared tabular file loading utility — avoids code duplication between engines
  - Loads CSV, TXT, DAT, XLSX, XLS, JSON, XML into pandas DataFrame
  - Auto-uses file encoding and delimiter detected by `FileDetectorService`
  - Used by both `ValidationChainEngine` AND `BusinessRuleEngine` for consistent file reading

#### `backend/app/services/business_rules.py`
- **Source:** **Priti only** (Goraksha did not have this file)
- **Functionality:** Full **Business Rules Engine** for data quality validation
- **Core Rules Catalog (CUS001–CUS010):**
  | Rule ID | Rule Name | Type |
  |---------|-----------|------|
  | CUS001 | Address Line 1 Required | required |
  | CUS002 | Account Description = Customer Name | equals_field |
  | CUS003 | Bill To Required | equals_value (Y) |
  | CUS004 | Ship To Required | equals_value (Y) |
  | CUS005 | Customer Name Required | required |
  | CUS006 | Primary/Business Key Required & Unique | key_unique |
  | CUS007 | Email Format Valid | regex |
  | CUS008 | Phone Format Valid | regex |
  | CUS009 | Country Required | required |
  | CUS010 | Duplicate Customer ID Not Allowed | unique_field |
- **Supported rule types:** `required`, `equals_value`, `equals_field`, `regex`, `unique_field`, `key_unique`
- **Smart field handling:**
  - Core rules → `NOT_APPLICABLE` if field doesn't exist in uploaded data (skipped silently)
  - Dynamic/user rules → `ERROR` if field doesn't exist (gap must be visible)
- **Entity-agnostic:** Same engine evaluates Customer, Supplier, Employee, or any future entity

#### `backend/app/services/fusion_extract_service.py`
- **Source:** **Goraksha only** (Priti did not have this file)
- **Functionality:**
  - Fusion Extract Preparation & Execution Timestamp Resolution Service
  - Extracts `20260902143000`-style timestamps from target extract filenames using Regex
  - Validates timestamp matching: source payload vs Fusion extract
  - **Blocks reconciliation** if timestamps don't match (returns `EXECUTION_MISMATCH`)
  - Reads record count from target file via `FileDetectorService`
  - Returns structured `FusionExtractPreparation` object

#### `backend/app/services/reconciliation_engine.py`
- **Source:** **Goraksha only** (Priti did not have this file)
- **Functionality:** **Production-Oriented Backend Reconciliation Engine** (268 lines)
- **Step-by-step execution:**
  1. **Timestamp Validation** — blocks reconciliation if `expected_execution_timestamp` ≠ `fusion_execution_timestamp`
  2. **File Loading** — loads Source and Target files from path or uploads directory (Excel/CSV/DAT)
  3. **Key Standardization** — maps source & target primary keys to `_recon_key` column
  4. **Set Operations** — calculates:
     - `MATCH` — keys present in both source and target
     - `MISSING_IN_ORACLE` — keys in source but not in target
     - `EXTRA_IN_ORACLE` — keys in target but not in source
  5. **Field-Level Mismatch** — for each matched key, compares all common columns row by row
  6. **Quality Grading** — assigns grade: `A+` (≥99%), `A` (≥95%), `B` (≥90%), `C` (≥80%), `D` (<80%)
  7. **Column Summary Metrics** — per-column breakdown of match/mismatch/missing counts
  8. **PostgreSQL Persistence** — writes results to `recon_runs` and `recon_summary_metrics` tables
  9. **In-Memory Store** — fallback when DB is offline (keyed by `batch_id` and `recon_run_id`)

---

### 🖥️ Frontend — `frontend/`

- **Source:** **Goraksha** (both folders had identical frontend — taken from Goraksha as base)
- **Framework:** Next.js 14 with TypeScript
- **Pages:**

| Page | Path | Owner | Description |
|------|------|-------|-------------|
| Landing | `app/landing/page.tsx` | Priti | Product landing page with features overview |
| Login | `app/login/page.tsx` | Priti | User authentication |
| Dashboard | `app/dashboard/page.tsx` | Deepti | Main analytics dashboard |
| Projects | `app/projects/page.tsx` | Priti | Project management list |
| Batches | `app/batches/page.tsx` | — | Batch run management |
| Audit | `app/audit/page.tsx` | — | Audit log viewer |
| Wizard | `app/wizard/` | Priti | Multi-step Conversion Wizard |

- **Wizard Steps (inside `app/wizard/steps/`):**

| Step File | Description |
|-----------|-------------|
| `StepDiscovery.tsx` | File upload + sheet detection (calls `/api/v1/discovery/upload-and-detect`) |
| `StepKeyDetection.tsx` | Primary key column selection |
| `StepMapping.tsx` | Column mapping between source and target |
| `StepRules.tsx` | Business rules selection + validation (calls `/api/v1/business-rules/validate`) |
| `StepExclusions.tsx` | Exclusion rules configuration |
| `StepPreLoad.tsx` | Pre-load data review |
| `StepReconciliation.tsx` | Reconciliation run + results display (calls `/api/v1/fusion/reconcile`) |
| `StepExport.tsx` | Export report (calls `/api/v1/fusion/export-report/{run_id}`) |

---

### 🗄️ Scripts — `scripts/`

- **Source:** **Both (virtually identical — Goraksha's version taken)**
- **Files:**

| File | Description |
|------|-------------|
| `init.sql` | PostgreSQL schema initialization — creates all tables: `recon_runs`, `recon_summary_metrics`, `projects`, `waves`, `modules`, `entities`, etc. (Utkarsha's work) |
| `verify_db.py` | Python script to verify DB connection and check tables were created correctly |

---

## 🔗 Full Merged Folder Tree

```
merge/DF-Recon/
├── .env                                        ← Goraksha
├── .dockerignore                               ← Priti
├── .gitignore                                  ← Priti
├── AGENTS.md                                   ← Priti
├── CLAUDE.md                                   ← Priti
├── docker-compose.yml                          ← Goraksha
├── Dockerfile                                  ← Priti
├── README.md                                   ← NEW (this file)
│
├── backend/
│   ├── Dockerfile                              ← Both (identical)
│   ├── requirements.txt                        ← Both (identical)
│   ├── uploads/                                ← Runtime: uploaded files
│   ├── tests/
│   │   ├── conftest.py                         ← Both (identical)
│   │   ├── test_fusion_engine.py               ← Goraksha
│   │   └── test_validation.py                  ← Both
│   └── app/
│       ├── __init__.py
│       ├── main.py                             ← ✅ MERGED (Goraksha + Priti, 14 endpoints)
│       │
│       ├── engine/                             ← Goraksha only
│       │   └── fbdi_hdl_parser.py              ← Goraksha: FBDI 5-step validator
│       │
│       ├── schemas/
│       │   ├── validation_schema.py            ← Goraksha (extended, 11 models)
│       │   └── business_rules_schema.py        ← Priti (added, 5 models)
│       │
│       └── services/
│           ├── file_detector.py                ← Goraksha (extended, 200 lines)
│           ├── validator_chain.py              ← Goraksha + Priti file_loader import
│           ├── file_loader.py                  ← Priti (added, shared loader utility)
│           ├── business_rules.py               ← Priti (added, CUS001-CUS010 engine)
│           ├── fusion_extract_service.py       ← Goraksha (timestamp + extract prep)
│           └── reconciliation_engine.py        ← Goraksha (full recon engine + DB persist)
│
├── frontend/
│   ├── Dockerfile                              ← Priti
│   ├── package.json                            ← Both (identical)
│   ├── tsconfig.json                           ← Both (identical)
│   ├── next.config.ts                          ← Both (identical)
│   ├── app/
│   │   ├── layout.tsx                          ← Priti
│   │   ├── page.tsx                            ← Priti
│   │   ├── globals.css                         ← Both (identical)
│   │   ├── landing/page.tsx                    ← Priti
│   │   ├── login/page.tsx                      ← Priti
│   │   ├── dashboard/page.tsx                  ← Deepti
│   │   ├── projects/page.tsx                   ← Priti
│   │   ├── batches/page.tsx                    ← Team
│   │   ├── audit/page.tsx                      ← Team
│   │   └── wizard/
│   │       ├── page.tsx                        ← Priti
│   │       ├── WizardShell.tsx                 ← Priti
│   │       └── steps/
│   │           ├── shared.tsx                  ← Priti
│   │           ├── StepDiscovery.tsx           ← Priti/Goraksha
│   │           ├── StepKeyDetection.tsx        ← Team
│   │           ├── StepMapping.tsx             ← Team
│   │           ├── StepRules.tsx               ← Priti
│   │           ├── StepExclusions.tsx          ← Team
│   │           ├── StepPreLoad.tsx             ← Team
│   │           ├── StepReconciliation.tsx      ← Goraksha
│   │           └── StepExport.tsx              ← Goraksha
│   ├── components/
│   │   ├── dashboard/                          ← Deepti
│   │   ├── layout/                             ← Priti
│   │   └── ui/                                 ← Team
│   └── lib/                                    ← Team
│
└── scripts/
    ├── init.sql                                ← Utkarsha (DB schema)
    └── verify_db.py                            ← Utkarsha
```

---

## 📋 All API Endpoints (Merged — 14 Total)

### System Endpoints
| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| `GET` | `/health` | Both | Health check — returns API status |
| `GET` | `/api/v1/db/status` | Both | PostgreSQL connectivity check — lists all tables |
| `GET` | `/api/v1/supported-formats` | Goraksha | Returns all supported file extensions |

### File Upload & Validation
| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/v1/upload-file` | Both | Upload single file, detect sheets, run validation chain |
| `POST` | `/api/v1/validate-folder` | Both | Validate files inside a local directory path |

### Discovery
| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/v1/discovery/upload-and-detect` | Both | Upload source + target files, detect sheets + run validation |
| `POST` | `/api/v1/discovery/scan-folder` | **Goraksha** | Scan a local folder path, auto-detect source & target files |

### Business Rules Engine
| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/v1/business-rules/core` | **Priti** | List core rules CUS001–CUS010 filtered by entity |
| `POST` | `/api/v1/business-rules/validate` | **Priti** | Run core + dynamic rules against an uploaded file |

### Fusion FBDI & Reconciliation
| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/v1/fusion/fbdi/validate` | **Goraksha** | Validate FBDI payload (ZIP/CSV/XLSX) — 5-step validation |
| `POST` | `/api/v1/fusion/extract/prepare` | **Goraksha** | Prepare Fusion extract, validate execution timestamp |
| `POST` | `/api/v1/fusion/reconcile` | **Goraksha** | Execute full backend reconciliation engine |
| `GET` | `/api/v1/fusion/reconciliation/{run_id}` | **Goraksha** | Retrieve past reconciliation run result by ID |
| `GET` | `/api/v1/fusion/export-report/{run_id}` | **Goraksha** | Export reconciliation report as JSON or CSV |

---

## 🚀 Quick Start

### With Docker (Recommended)
```bash
cd merge/DF-Recon
docker compose up --build
```
- **Backend API + Docs:** http://localhost:8000/docs
- **Frontend UI:** http://localhost:3000
- **PostgreSQL:** localhost:5432

### Backend Only
```bash
cd merge/DF-Recon/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend Only
```bash
cd merge/DF-Recon/frontend
npm install
npm run dev
```

---

## 👥 Team Contributions Summary

| Person | What They Built | Files Owned |
|--------|----------------|-------------|
| **Goraksha** | File detection, FBDI validation, Fusion extract timestamp matching, Backend reconciliation engine, DB persistence, Recon export | `engine/fbdi_hdl_parser.py`, `services/fusion_extract_service.py`, `services/reconciliation_engine.py`, `services/file_detector.py` (extended) |
| **Priti** | Landing page, Login, Conversion Wizard UI, Business Rules Engine (CUS001–CUS010), Shared file loader | `services/business_rules.py`, `services/file_loader.py`, `schemas/business_rules_schema.py`, `frontend/app/landing/`, `frontend/app/login/`, `frontend/app/wizard/` |
| **Deepti** | Dashboard UI, Dashboard components | `frontend/app/dashboard/`, `frontend/components/dashboard/` |
| **Utkarsha** | PostgreSQL database schema, DB verification | `scripts/init.sql`, `scripts/verify_db.py` |
