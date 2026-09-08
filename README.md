# DF-Recon — Merged Project

Full-stack data reconciliation platform combining all four branches.

## Team Contributions

| # | Name | Tasks | Folder |
|---|------|-------|--------|
| 1 | Priti | Landing page, Login page, Conversion Wizard (Discovery) | `frontend/` — base UI |
| 2 | Deepti | Dashboard, Testing | `frontend/components/dashboard/` |
| 3 | Goraksha | Upload files, File & sheet detection | `backend/` |
| 4 | Utkarsha | Schema discovery, Data profiling | `scripts/` (DB schema) |

## Architecture

```
merge/
├── frontend/          ← Next.js app (Priti's UI + Deepti's dashboard components)
│   ├── app/
│   │   ├── landing/   ← Priti: Landing page
│   │   ├── login/     ← Priti: Login page
│   │   ├── wizard/    ← Priti: Conversion Wizard (Discovery + all steps)
│   │   ├── projects/  ← Priti: Projects page
│   │   ├── batches/   ← Priti: Batches page
│   │   └── audit/     ← Priti: Audit Trail
│   └── components/
│       ├── dashboard/ ← Deepti: StatCard, MigrationProjectsTable, QuickStartPanel
│       ├── layout/    ← Priti: AppLayout, Sidebar, Header
│       └── ui/        ← Priti: Button, Badge, Modal, Toast, Input, ConfirmDialog
├── backend/           ← FastAPI (Goraksha: file upload + file/sheet detection)
│   └── app/
│       ├── main.py
│       ├── services/
│       │   ├── file_detector.py
│       │   └── validator_chain.py
│       └── schemas/
│           └── validation_schema.py
├── scripts/           ← PostgreSQL schema (Utkarsha)
│   ├── init.sql       ← 14-table DB schema + seed data
│   └── verify_db.py
├── docker-compose.yml ← Wires all 3 services
└── .env
```

## Running with Docker

```bash
cd merge
docker compose up --build
```

- Frontend → http://localhost:3000
- Backend API → http://localhost:8000
- API Docs → http://localhost:8000/docs
- PostgreSQL → localhost:5432

## Running locally (dev)

### Frontend
```bash
cd merge/frontend
npm install
npm run dev
```

### Backend
```bash
cd merge/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Database
```bash
cd merge
docker compose up postgres -d
python scripts/verify_db.py
```

## How the merge works

- **Priti's UI** is the application shell — all pages, layout, sidebar, wizard steps
- **Deepti's dashboard components** (StatCard, MigrationProjectsTable, QuickStartPanel) are available in `components/dashboard/` and can be imported into the dashboard page
- **Goraksha's FastAPI backend** handles file uploads and sheet detection — the wizard's Discovery step calls `/api/v1/discovery/upload-and-detect` (proxied via Next.js rewrites), falling back to client-side simulation if the backend is offline
- **Utkarsha's DB schema** (`init.sql`) initialises PostgreSQL with 14 tables covering projects, waves, entities, recon runs, file inventory, business rules, exceptions and summary metrics
