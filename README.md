# LightSpeed - Data Conversion & Reconciliation Automation Platform

## Feature Module: File Upload, Sheet Detection & Data Validation Chain

### 1. Features Implemented
- **File Upload API**: Multi-part upload endpoint supporting up to 8 file extensions (`.xlsx`, `.xls`, `.csv`, `.txt`, `.dat`, `.zip`, `.json`, `.xml`).
- **File & Sheet Detection Engine**: Automatic detection of sheet names, row counts, column lists, delimiters, and encodings.
- **5-Step Sequential Validation Chain**:
  1. **Folder Validation**: Verifies directory exists.
  2. **File Validation**: Verifies supported format exists.
  3. **File Size Check**: Verifies file size > 0 bytes.
  4. **Record Count Check**: Verifies record count > 0 rows.
  5. **Required Columns Check**: Verifies target schema header presence.
  6. **Duplicate Check**: Detects full row duplicates and primary key duplicates.
  7. **Null Check**: Calculates null/empty count breakdown per column.

---

### 2. Quick Start & Server Run

#### Install Dependencies
```bash
pip install -r backend/requirements.txt
```

#### Run FastAPI Server
```bash
uvicorn backend.app.main:app --reload --port 8000
```
Swagger API Documentation: http://localhost:8000/docs

#### Run Pytest Unit Tests
```bash
python -m pytest backend/tests/
```

---

### 3. Git Commands (To Commit & Push)

```bash
git add .
git commit -m "feat: add file upload, sheet detection, and 5-step data validation chain"
git push origin Goraksh
```
