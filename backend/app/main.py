import os
import sys
import shutil

backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from typing import Any, List, Optional
import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel
import uuid
import pandas as pd

# ── Schemas ───────────────────────────────────────────────────────────────────
from app.schemas.validation_schema import (
    ValidationChainReport, DiscoveryResponse,
    ReconciliationRequest, ReconciliationReportResponse, FusionExtractPreparation
)
from app.schemas.business_rules_schema import (
    BusinessRule, BusinessRuleValidationRequest, BusinessValidationReport
)
from app.schemas.key_detection_schema import (
    KeyDetectionRequest, KeyDetectionResponse,
    KeyValidationRequest, RightKeyValidationResult,
    BasicValidationCheck, FullKeyAnalysisResponse,
    CandidateKeyPair, KeyPairEvaluationRequest
)

# ── Project/Scanner Services ──────────────────────────────────────────────────
from app.services.project_scanner import ProjectScannerService


# ── Services ──────────────────────────────────────────────────────────────────
from app.services.file_detector import FileDetectorService, FileDetectionResult, SUPPORTED_EXTENSIONS
from app.services.validator_chain import ValidationChainEngine
from app.services.file_loader import load_dataframe
from app.services.business_rules import BusinessRuleEngine, get_core_rules, CORE_RULES_BY_ID
from app.services.github_connector import GitHubConnectorError, GitHubConnectorService
from app.services.key_detector import KeyDetectionEngine


# ── Engine Layer ──────────────────────────────────────────────────────────────
from app.engine.fbdi_hdl_parser import FBDIParser
from app.services.fusion_extract_service import FusionExtractService
from app.services.reconciliation_engine import BackendReconciliationEngine
from app.services.key_detector import KeyDetectionEngine as _KeyDetectionEngine


app = FastAPI(
    title="DF-Recon Merged API",
    description=(
        "Complete merged API — combines:\n"
        "  • Goraksha : File detection, FBDI validation, Fusion Extract preparation, "
        "Backend Reconciliation Engine, Export\n"
        "  • Priti    : Business Rules Engine (core CUS001-CUS010 + dynamic rules)\n"
        "  • Utkarsha : GitHub Connector, Excel Report Builder, PostgreSQL DB schema persistence"
    ),
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", "")


# ── Auth Models (Deepti) ──────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class UserSession(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    avatar: str
    token: str
    authenticated_at: str


class LoginResponse(BaseModel):
    success: bool
    token: str
    user: UserSession
    message: str


# Mock DB for Active Sessions
ACTIVE_SESSIONS = {}


# ── GitHub request models (Utkarsh) ──────────────────────────────────────────

class GitHubConnectionRequest(BaseModel):
    token: str


class GitHubFilesRequest(BaseModel):
    token: str
    owner: str
    repository: str
    branch: str


class GitHubFileContentRequest(GitHubFilesRequest):
    path: str


class GitHubWriteFileRequest(GitHubFilesRequest):
    path: str
    content: str = ""
    message: str
    workbook: Optional[List[dict]] = None


# ── Legacy reconciliation request model (Utkarsh / frontend wizard) ───────────

class LegacyReconciliationRequest(BaseModel):
    source_file: str
    target_file: str
    source_key: str
    target_key: str
    mappings: List[dict[str, Any]] = []
    exclusions: List[dict[str, Any]] = []
    rules: List[dict[str, Any]] = []


class LegacyReconciliationReportRequest(LegacyReconciliationRequest):
    batch_name: str = "DF-Recon Batch"
    batch_id: str = "batch"
    report: Optional[dict[str, Any]] = None


# =============================================================================
# AUTHENTICATION ENDPOINTS  (Deepti Tiwari)
# =============================================================================

@app.post("/api/v1/auth/login", response_model=LoginResponse)
def login_user(req: LoginRequest):
    """
    Mock login endpoint to authenticate a user.
    Supports dynamic user generation based on email provided.
    """
    email_clean = req.email.strip().lower()
    
    # Hardcoded check for admin
    if email_clean == "admin@dfrecon.io" and req.password != "admin":
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
        
    # Dynamically determine role and name based on email
    if "deepti" in email_clean:
        user_name = "Deepti Tiwari"
        user_role = "Reconciliation Lead"
    elif "utkarsh" in email_clean:
        user_name = "Utkarsh Kadu"
        user_role = "System Admin"
    else:
        user_name = email_clean.split("@")[0].capitalize()
        user_role = "Business User"

    token = f"dfrecon_tok_{uuid.uuid4().hex[:12]}"
    now_iso = pd.Timestamp.now().isoformat()

    session = UserSession(
        user_id=f"usr_{hash(email_clean) % 10000}",
        name=user_name,
        email=email_clean,
        role=user_role,
        avatar=f"https://api.dicebear.com/7.x/initials/svg?seed={user_name}",
        token=token,
        authenticated_at=now_iso
    )

    ACTIVE_SESSIONS[token] = session

    return LoginResponse(
        success=True,
        token=token,
        user=session,
        message=f"Welcome back, {user_name}! Authentication successful."
    )


@app.get("/api/v1/auth/me", response_model=UserSession)
def get_current_user(token: Optional[str] = Header(None, alias="Authorization")):
    """
    Returns active authenticated user session by token.
    """
    tok = (token or "").replace("Bearer ", "").strip()
    if tok and tok in ACTIVE_SESSIONS:
        return ACTIVE_SESSIONS[tok]

    # Default fallback user session
    return UserSession(
        user_id="usr_001",
        name="Deepti Tiwari",
        email="deepti@dfrecon.io",
        role="Reconciliation Lead",
        avatar="https://api.dicebear.com/7.x/initials/svg?seed=Deepti%20Tiwari",
        token="dfrecon_tok_default",
        authenticated_at=pd.Timestamp.now().isoformat()
    )


@app.post("/api/v1/auth/logout")
def logout_user(token: Optional[str] = Header(None, alias="Authorization")):
    """
    Logs out user and invalidates session token.
    """
    tok = (token or "").replace("Bearer ", "").strip()
    if tok in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[tok]
    return {"success": True, "message": "Successfully logged out of DF-Recon workspace."}


# =============================================================================
# HEALTH & SYSTEM
# =============================================================================

@app.get("/health")
def health_check():
    return {"status": "HEALTHY", "service": "DF-Recon Merged API", "version": "3.0.0"}


@app.get("/api/v1/db/status")
def db_status():
    """Check PostgreSQL connectivity (Utkarsha's schema)."""
    if not DATABASE_URL:
        return {"connected": False, "reason": "DATABASE_URL not set"}
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' ORDER BY table_name;"
        )
        tables = [r[0] for r in cursor.fetchall()]
        cursor.close()
        conn.close()
        return {"connected": True, "tables": tables, "table_count": len(tables)}
    except Exception as e:
        return {"connected": False, "reason": str(e)}


@app.get("/api/v1/supported-formats")
def get_supported_formats():
    return {
        "supported_extensions": sorted(list(SUPPORTED_EXTENSIONS)),
        "count": len(SUPPORTED_EXTENSIONS)
    }


# =============================================================================
# GITHUB CONNECTOR  (Utkarsha)
# =============================================================================

@app.post("/api/v1/github/repositories")
async def github_repositories(request: GitHubConnectionRequest):
    """Validate a GitHub token and return repositories visible to that account."""
    try:
        repositories = await GitHubConnectorService.list_repositories(request.token)
        return {"repositories": repositories}
    except GitHubConnectorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/v1/github/files")
async def github_files(request: GitHubFilesRequest):
    """Return the files in a selected repository branch."""
    try:
        files = await GitHubConnectorService.list_files(
            request.token,
            request.owner,
            request.repository,
            request.branch,
        )
        return {"files": files}
    except GitHubConnectorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/v1/github/branches")
async def github_branches(request: GitHubFilesRequest):
    try:
        return {"branches": await GitHubConnectorService.list_branches(request.token, request.owner, request.repository)}
    except GitHubConnectorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/v1/github/file-content")
async def github_file_content(request: GitHubFileContentRequest):
    """Return UTF-8 content for a selected GitHub file."""
    try:
        return await GitHubConnectorService.get_file_content(
            request.token,
            request.owner,
            request.repository,
            request.branch,
            request.path,
        )
    except GitHubConnectorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.post("/api/v1/github/write-file")
async def github_write_file(request: GitHubWriteFileRequest):
    try:
        return await GitHubConnectorService.write_file(
            request.token, request.owner, request.repository, request.branch,
            request.path, request.content, request.message, request.workbook,
        )
    except GitHubConnectorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


# =============================================================================
# FILE UPLOAD & VALIDATION  (Goraksha)
# =============================================================================

@app.post("/api/v1/upload-file", response_model=ValidationChainReport)
async def upload_and_validate_file(
    file: UploadFile = File(...),
    file_type: str = Form("SOURCE"),           # SOURCE or TARGET_EXTRACT
    required_columns: Optional[str] = Form(None),  # Comma-separated
    primary_key_column: Optional[str] = Form(None),
    batch_id: Optional[str] = Form(None)
):
    """
    Uploads a single file (Source or Target Extract), detects sheets,
    and executes the full validation chain.
    Saves to Batch physical folder if batch_id provided, otherwise UPLOAD_DIR.
    """
    req_cols = [c.strip() for c in required_columns.split(",")] if required_columns else []

    save_dir = UPLOAD_DIR
    if batch_id:
        batch = ProjectScannerService.get_batch(batch_id)
        if batch and "path" in batch:
            folder_name = "01-Source" if file_type == "SOURCE" else "04-Fusion"
            save_dir = os.path.join(batch["path"], folder_name)
            os.makedirs(save_dir, exist_ok=True)
            
    file_location = os.path.join(save_dir, file.filename)
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if batch_id:
        ProjectScannerService.register_file(batch_id, file_type, file.filename, file_location)

    report = ValidationChainEngine.execute_validation_chain(
        folder_path=save_dir,
        target_file_name=file.filename,
        file_type=file_type,
        required_columns=req_cols,
        primary_key_column=primary_key_column
    )
    return report


# =============================================================================
# DISCOVERY ENDPOINTS  (Goraksha)
# =============================================================================

@app.post("/api/v1/discovery/upload-and-detect", response_model=DiscoveryResponse)
async def discovery_upload_and_detect(
    batch_id: str = Form("Batch_001"),
    source_file: Optional[UploadFile] = File(None),
    target_file: Optional[UploadFile] = File(None)
):
    """
    Discovery Stage Endpoint:
    Matches UI Step 1 (Upload Files: Source File Upload & Fusion Target Extract Upload)
    and Step 2 (File & Sheet Detection).
    """
    try:
        response = DiscoveryResponse(batch_id=batch_id)
        
        batch = ProjectScannerService.get_batch(batch_id)
        base_path = batch["path"] if batch else UPLOAD_DIR

        # Process Source File
        if source_file and source_file.filename:
            src_dir = os.path.join(base_path, "01-Source") if batch else UPLOAD_DIR
            os.makedirs(src_dir, exist_ok=True)
            src_path = os.path.join(src_dir, source_file.filename)
            with open(src_path, "wb") as buffer:
                shutil.copyfileobj(source_file.file, buffer)
            
            if batch:
                ProjectScannerService.register_file(batch_id, "SOURCE", source_file.filename, src_path)

            response.source_file_info = FileDetectorService.detect_file_and_sheets(src_path, file_type="SOURCE")
            response.source_validation_report = ValidationChainEngine.execute_validation_chain(
                folder_path=src_dir,
                target_file_name=source_file.filename,
                file_type="SOURCE"
            )

        # Process Target Extract File (Fusion Extract)
        if target_file and target_file.filename:
            tgt_dir = os.path.join(base_path, "04-Fusion") if batch else UPLOAD_DIR
            os.makedirs(tgt_dir, exist_ok=True)
            tgt_path = os.path.join(tgt_dir, target_file.filename)
            with open(tgt_path, "wb") as buffer:
                shutil.copyfileobj(target_file.file, buffer)
                
            if batch:
                ProjectScannerService.register_file(batch_id, "TARGET_EXTRACT", target_file.filename, tgt_path)

            response.target_file_info = FileDetectorService.detect_file_and_sheets(tgt_path, file_type="TARGET_EXTRACT")
            response.target_validation_report = ValidationChainEngine.execute_validation_chain(
                folder_path=tgt_dir,
                target_file_name=target_file.filename,
                file_type="TARGET_EXTRACT"
            )

        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File Processing Error: {str(e)}")


# =============================================================================
# PROJECT MANAGEMENT ENDPOINTS
# =============================================================================

@app.post("/api/v1/projects/import-from-path")
def import_project_from_path(
    name: str = Form(...),
    description: str = Form(""),
    folder_path: str = Form(...),
    status: str = Form("Active"),
    tags: str = Form(""),
    file_paths: Optional[str] = Form(None)
):
    """
    Imports a project by scanning the folder architecture path.
    Creates project, modules, entities, batches, and links existing files.
    """
    return ProjectScannerService.import_project_from_path(name, description, folder_path, status, tags, file_paths)

def _profile_file_from_db(file_id: str, file_name: str, file_type: str):
    import tempfile
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT file_content FROM app_files WHERE id = %s", (file_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row[0]:
            ext = os.path.splitext(file_name)[1] if file_name else ""
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(row[0])
                tmp_path = tmp.name
            try:
                detection = FileDetectorService.detect_file_and_sheets(tmp_path, file_type=file_type)
                return detection.dict()
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
    except Exception as e:
        print(f"Error profiling from DB: {e}")
    return None

@app.get("/api/v1/batches/{batch_id}/files")
def get_batch_files(batch_id: str):
    """
    Retrieves the registered Source and Target files for a given batch.
    Profiles them so the frontend gets full column and sample data.
    """
    files_info = ProjectScannerService.get_files_for_batch(batch_id)
    
    for f_key, f_type in [("source_file", "SOURCE"), ("target_file", "TARGET_EXTRACT")]:
        f_info = files_info.get(f_key)
        if f_info:
            path = f_info.get("file_path", "")
            file_id = f_info.get("id")
            file_name = f_info.get("file_name", "")
            
            if path and os.path.exists(path):
                try:
                    detection = FileDetectorService.detect_file_and_sheets(path, file_type=f_type)
                    f_info["profile"] = detection.dict()
                except Exception:
                    pass
            elif file_id:
                profile = _profile_file_from_db(file_id, file_name, f_type)
                if profile:
                    f_info["profile"] = profile
                    
    return files_info


@app.post("/api/v1/validate-folder", response_model=ValidationChainReport)
def validate_local_folder(
    folder_path: str,
    target_file_name: Optional[str] = None,
    required_columns: Optional[List[str]] = Query(None),
    primary_key_column: Optional[str] = None
):
    """
    Validates files inside an existing local directory.
    Executes Folder Validation → File Validation → Data Validation Execution Chain.
    """
    report = ValidationChainEngine.execute_validation_chain(
        folder_path=folder_path,
        target_file_name=target_file_name,
        required_columns=required_columns,
        primary_key_column=primary_key_column
    )
    return report


@app.post("/api/v1/discovery/scan-folder", response_model=DiscoveryResponse)
async def discovery_scan_folder(
    folder_path: str = Form(...),
    batch_id: Optional[str] = Form("Batch_001")
):
    """
    Scans project folder architecture path (including subdirectories) for
    Excel (.xlsx, .xls), CSV, DAT, and Zip files.

    Selection is architecture-aware:
    - `01-source` directory wins for source_file_info
    - `04-fusion` directory wins for target_file_info

    If the source/fusion folders are absent, the route stays silent rather than
    manufacturing fake source/target file records from a filename keyword guess.
    """
    response = DiscoveryResponse(batch_id=batch_id, folder_path=folder_path)

    if os.path.exists(folder_path) and os.path.isdir(folder_path):
        supported_files = []
        for root, _, files in os.walk(folder_path):
            for file_name in files:
                full_p = os.path.join(root, file_name)
                if FileDetectorService.is_supported_file(file_name) and not file_name.startswith("~$"):
                    supported_files.append((file_name, full_p))

        detected_list = []
        for file_name, file_path in supported_files:
            info = FileDetectorService.detect_file_and_sheets(file_path, file_type="SOURCE")
            info.file_path = file_path
            detected_list.append(info)

        response.discovered_files = detected_list

        def is_valid_non_empty_file(info: FileDetectionResult) -> bool:
            if info.file_size_bytes == 0:
                return False
            if not info.sheets:
                return False
            return any((s.record_count > 0 or s.column_count > 0) for s in info.sheets)

        def in_source_architecture(f: FileDetectionResult) -> bool:
            return "01-source" in str(f.file_path).lower() if f.file_path else False
            
        def in_fusion_architecture(f: FileDetectionResult) -> bool:
            return "04-fusion" in str(f.file_path).lower() if f.file_path else False

        source_candidates = [f for f in detected_list if in_source_architecture(f) and is_valid_non_empty_file(f)]
        target_candidates = [f for f in detected_list if in_fusion_architecture(f) and is_valid_non_empty_file(f)]

        # Prefer the first explicit non-empty architecture match.
        if source_candidates:
            response.source_file_info = source_candidates[0]
        if target_candidates:
            target = target_candidates[0]
            target.file_type = "TARGET_EXTRACT"
            response.target_file_info = target

    else:
        response.overall_status = "FOLDER_PATH_NOT_LOCAL_OR_EMPTY"

    return response


# =============================================================================
# BUSINESS RULES ENGINE  (Priti)
# =============================================================================

@app.get("/api/v1/business-rules/core")
def list_core_business_rules(entity: Optional[str] = None):
    """
    Returns the hard-coded core business rule catalog (CUS001-CUS010),
    optionally filtered by entity (Customer, Supplier, Employee, ...).
    Used by the Conversion Wizard's Quality section to show which core
    rules are available for the selected entity.
    """
    rules = get_core_rules(entity)
    return {"entity": entity, "rules": [r.model_dump() for r in rules]}


@app.post("/api/v1/business-rules/validate", response_model=BusinessValidationReport)
def run_business_rule_validation(payload: BusinessRuleValidationRequest):
    """
    Runs core + dynamic business validation rules (Quality section) against
    a file that was already uploaded via /api/v1/discovery/upload-and-detect
    (or /api/v1/upload-file). Reuses the same UPLOAD_DIR and the shared
    dataframe loader — no duplicate rules engine, no duplicate file parsing.
    """
    file_path = os.path.join(UPLOAD_DIR, payload.file_name)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=(
                f"Uploaded file '{payload.file_name}' was not found on the server. "
                "Please re-upload it in the Discovery step and try again."
            ),
        )

    df = load_dataframe(file_path)
    if df is None:
        raise HTTPException(
            status_code=422,
            detail=f"File '{payload.file_name}' could not be parsed as tabular data.",
        )

    core_rules: List[BusinessRule] = []
    for rid in payload.core_rule_ids:
        core_rule = CORE_RULES_BY_ID.get(rid)
        if core_rule and core_rule.entity.lower() == payload.entity.lower():
            core_rules.append(core_rule)

    dynamic_rules: List[BusinessRule] = []
    for r in payload.dynamic_rules:
        # Dynamic rules are always scoped to the entity being validated and
        # are never treated as core, regardless of what the client sent.
        dynamic_rules.append(r.model_copy(update={"entity": payload.entity, "is_core": False}))

    all_rules = core_rules + dynamic_rules

    report = BusinessRuleEngine.evaluate(
        df=df,
        rules=all_rules,
        entity=payload.entity,
        primary_key_column=payload.primary_key_column,
    )
    return report


# =============================================================================
# KEY DETECTION ENGINE  (Source vs FBDI value-overlap analysis)
# =============================================================================

@app.post("/api/v1/key-detect")
async def detect_primary_keys(
    source_file: UploadFile = File(...),
    fbdi_file: UploadFile = File(...),
):
    """
    Detects primary keys by comparing SOURCE file vs FBDI/HDL file.

    Pipeline:
      1. Load both uploaded files into DataFrames
      2. Detect Oracle entity type from FBDI column names / filename
      3. Auto-assign Oracle FBDI primary key columns by entity
      4. Extract unique values from FBDI key columns
      5. For each source column: calculate null %, unique %, value overlap vs FBDI
      6. Rank candidates: Strong / Possible / Weak
      7. Return top 15 candidates + suggested source key + suggested FBDI key
    """
    src_bytes = await source_file.read()
    fbdi_bytes = await fbdi_file.read()

    engine = _KeyDetectionEngine()
    result = engine.detect(
        source_content=src_bytes,
        source_name=source_file.filename or "source_file",
        fbdi_content=fbdi_bytes,
        fbdi_name=fbdi_file.filename or "fbdi_file",
        max_candidates=15,
    )
    return result.to_dict()


# =============================================================================
# FUSION LOAD & ERP EXTRACT ENDPOINTS  (Goraksha)
# =============================================================================

@app.post("/api/v1/fusion/fbdi/validate")
async def validate_fbdi(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    entity: Optional[str] = Form("Supplier")
):
    """
    Validates FBDI payload (ZIP, CSV, XLSX) structure, header names,
    data types, and mandatory fields.
    Supports Oracle Fusion Financials, SCM, and HCM entities.
    """
    target_path = file_path
    if file and file.filename:
        save_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        target_path = save_path

    return FBDIParser.validate_fbdi_payload(target_path, entity=entity or "Supplier")


@app.post("/api/v1/fusion/extract/prepare", response_model=FusionExtractPreparation)
async def prepare_fusion_extract(
    batch_id: str = Form("Batch_001"),
    target_file_path: Optional[str] = Form(None),
    expected_execution_timestamp: Optional[str] = Form("20260902143000")
):
    """
    Prepares Fusion Target Extract and extracts execution timestamp
    (e.g. 20260902143000) from filename using regex.
    Validates matching against expected payload — blocks reconciliation on mismatch.
    """
    return FusionExtractService.prepare_fusion_extract(
        batch_id=batch_id,
        target_file_path=target_file_path,
        expected_execution_timestamp=expected_execution_timestamp
    )


# =============================================================================
# RECONCILIATION ENGINE  (Goraksha — Backend Authoritative)
# =============================================================================

@app.post("/api/v1/fusion/reconcile", response_model=ReconciliationReportResponse)
def execute_fusion_reconciliation(req: ReconciliationRequest):
    """
    Backend-driven authoritative reconciliation execution engine.
    Calculates MATCH, MISMATCH, MISSING_IN_ORACLE, EXTRA_IN_ORACLE,
    DUPLICATE, NOT_LOADED.
    Enforces execution timestamp matching and persists results to PostgreSQL.
    """
    return BackendReconciliationEngine.execute_reconciliation(req)


@app.get("/api/v1/fusion/reconciliation/{run_id}", response_model=ReconciliationReportResponse)
def get_fusion_reconciliation_result(run_id: str):
    """
    Retrieves stored reconciliation run results by batch_id or recon_run_id.
    """
    result = BackendReconciliationEngine.get_recon_result(run_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Reconciliation run '{run_id}' not found."
        )
    return result


@app.get("/api/v1/fusion/export-report/{run_id}")
def export_reconciliation_report(run_id: str, format: str = Query("json")):
    """
    Exports backend-backed reconciliation report in JSON or CSV summary.
    """
    result = BackendReconciliationEngine.get_recon_result(run_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Reconciliation run '{run_id}' not found."
        )

    if format.lower() == "csv":
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Run ID", "Batch ID", "Status", "Total Source", "Total Target",
            "Matched", "Mismatched", "Unmatched Source", "Unmatched Target", "Match Rate"
        ])
        writer.writerow([
            result.recon_run_id, result.batch_id, result.status,
            result.totalSource, result.totalTarget, result.matched,
            result.mismatched, result.unmatchedSource, result.unmatchedTarget,
            f"{result.matchRate}%"
        ])
        return JSONResponse(content={
            "csv_content": output.getvalue(),
            "filename": f"recon_report_{run_id}.csv"
        })

    return result


# =============================================================================
# FILE STORAGE IN POSTGRESQL
# =============================================================================

def _get_db_conn():
    """Open a psycopg2 connection. Raises 503 if DATABASE_URL is not set."""
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not configured.")
    import psycopg2
    return psycopg2.connect(DATABASE_URL)


@app.post("/api/v1/files/upload")
async def upload_file_to_db(
    file: UploadFile = File(...),
    file_id: str = Form(...),
    project_id: str = Form(""),
    batch_id: Optional[str] = Form(None),
    file_role: str = Form("other"),
    storage_path: str = Form(...),
):
    """
    Saves the uploaded file binary (BYTEA) directly into PostgreSQL app_files.
    Uses storage_path as the unique key — re-uploading the same path overwrites.
    Also profiles file sheets & columns and returns profile in response.
    """
    import psycopg2
    content = await file.read()
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO app_files
                (id, project_id, batch_id, file_role, file_name, storage_path,
                 file_content, file_size, mime_type, uploaded_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (storage_path) DO UPDATE SET
                id           = EXCLUDED.id,
                file_content = EXCLUDED.file_content,
                file_size    = EXCLUDED.file_size,
                file_name    = EXCLUDED.file_name,
                mime_type    = EXCLUDED.mime_type,
                uploaded_at  = NOW()
            """,
            (
                file_id,
                project_id or None,
                batch_id or None,
                file_role,
                file.filename,
                storage_path,
                psycopg2.Binary(content),
                len(content),
                file.content_type or "application/octet-stream",
            ),
        )
        conn.commit()
        cur.close()
        conn.close()

        profile = None
        try:
            import io
            detection = FileDetectorService.detect_file_and_sheets(io.BytesIO(content), file_type=file_role, file_name=file.filename)
            profile = detection.dict()
        except Exception as pe:
            print(f"In-memory profiling warning: {pe}")

        return {"success": True, "file_id": file_id, "file_name": file.filename,
                "file_size": len(content), "storage_path": storage_path, "profile": profile}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB upload failed: {e}")


@app.get("/api/v1/files/by-id/{file_id}")
def download_file_by_id(file_id: str):
    """Stream a file from PostgreSQL by its file_id."""
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT file_name, file_content, mime_type FROM app_files WHERE id = %s",
            (file_id,),
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            raise HTTPException(status_code=404, detail=f"File id '{file_id}' not found.")
        file_name, file_content, mime_type = row
        return StreamingResponse(
            io.BytesIO(bytes(file_content)),
            media_type=mime_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB download failed: {e}")


@app.get("/api/v1/files/by-path/{storage_path:path}")
def download_file_by_path(storage_path: str):
    """Stream a file from PostgreSQL by its canonical storage_path."""
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT file_name, file_content, mime_type FROM app_files WHERE storage_path = %s",
            (storage_path,),
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            raise HTTPException(status_code=404, detail=f"File path '{storage_path}' not found.")
        file_name, file_content, mime_type = row
        return StreamingResponse(
            io.BytesIO(bytes(file_content)),
            media_type=mime_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB download failed: {e}")


@app.get("/api/v1/files")
def list_files(
    project_id: Optional[str] = None,
    batch_id: Optional[str] = None,
):
    """List file metadata (no content bytes) filtered by project or batch."""
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        query = (
            "SELECT id, project_id, batch_id, file_role, file_name, storage_path, "
            "file_size, mime_type, uploaded_at FROM app_files WHERE 1=1"
        )
        params: list = []
        if project_id:
            query += " AND project_id = %s"; params.append(project_id)
        if batch_id:
            query += " AND batch_id = %s"; params.append(batch_id)
        query += " ORDER BY uploaded_at DESC"
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close(); conn.close()
        return {"files": [
            {"id": r[0], "project_id": r[1], "batch_id": r[2], "file_role": r[3],
             "file_name": r[4], "storage_path": r[5], "file_size": r[6],
             "mime_type": r[7], "uploaded_at": r[8].isoformat() if r[8] else None}
            for r in rows
        ]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB list failed: {e}")


# =============================================================================
# LEGACY RECONCILIATION  (Utkarsha — Wizard-driven, client-side Excel report)
# =============================================================================

@app.post("/api/v1/reconciliation/run")
def run_reconciliation(request: LegacyReconciliationRequest):
    try:
        return ValidationChainEngine.reconcile_files(
            UPLOAD_DIR, request.source_file, request.target_file,
            request.source_key, request.target_key,
            request.mappings, request.exclusions, request.rules,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/v1/reconciliation/report.xlsx")
def reconciliation_report(request: LegacyReconciliationReportRequest):
    try:
        report = request.report or ValidationChainEngine.reconcile_files(
            UPLOAD_DIR, request.source_file, request.target_file,
            request.source_key, request.target_key,
            request.mappings, request.exclusions, request.rules,
        )
        workbook = ValidationChainEngine.build_report_workbook(
            report, request.batch_name, request.source_file, request.target_file,
        )
        return StreamingResponse(
            io.BytesIO(workbook),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="df-recon_{request.batch_id}.xlsx"'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# =============================================================================
# KEY DETECTION (Dynamic Source & FBDI)
# =============================================================================

def _resolve_key_file_path(path: str) -> Optional[str]:
    if not path:
        return None
    if os.path.exists(path):
        return os.path.abspath(path)
    p = os.path.join(UPLOAD_DIR, path)
    if os.path.exists(p):
        return p
    base = os.path.basename(path)
    p_base = os.path.join(UPLOAD_DIR, base)
    if os.path.exists(p_base):
        return p_base
    for root, _, files in os.walk(UPLOAD_DIR):
        if base in files:
            return os.path.join(root, base)
    for alt_base in [backend_root, os.path.dirname(backend_root), "/app"]:
        alt = os.path.join(alt_base, path)
        if os.path.exists(alt):
            return os.path.abspath(alt)
        alt_sub = os.path.join(alt_base, base)
        if os.path.exists(alt_sub):
            return os.path.abspath(alt_sub)
    return None


@app.post("/api/v1/keys/detect", response_model=KeyDetectionResponse)
def detect_candidate_keys(request: KeyDetectionRequest):
    try:
        source_path = _resolve_key_file_path(request.source_file)
        target_path = _resolve_key_file_path(request.target_file)
        if not source_path or not target_path:
            missing = []
            if not source_path: missing.append(f"Source file '{request.source_file}'")
            if not target_path: missing.append(f"Target/FBDI file '{request.target_file}'")
            raise HTTPException(status_code=404, detail=f"Files not found: {', '.join(missing)}")
            
        candidates, all_source_cols = KeyDetectionEngine.detect_candidate_keys(
            source_path, target_path, top_n=request.top_n, return_all_source_columns=True
        )
        return KeyDetectionResponse(candidates=candidates, all_source_columns=all_source_cols)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/keys/evaluate-pair", response_model=CandidateKeyPair)
def evaluate_key_pair(request: KeyPairEvaluationRequest):
    try:
        source_path = _resolve_key_file_path(request.source_file)
        target_path = _resolve_key_file_path(request.target_file)
        if not source_path or not target_path:
            raise HTTPException(status_code=404, detail="Source or Target file not found")
        
        df_src = load_dataframe(source_path)
        if df_src is None or df_src.empty:
            df_src = pd.read_csv(source_path, low_memory=False)
        df_tgt = load_dataframe(target_path)
        if df_tgt is None or df_tgt.empty:
            df_tgt = pd.read_csv(target_path, low_memory=False)

        return KeyDetectionEngine.calculate_pair_metrics(
            df_src, df_tgt, request.source_column, request.target_column
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/keys/validate", response_model=RightKeyValidationResult)
def validate_right_key(request: KeyValidationRequest):
    try:
        source_path = _resolve_key_file_path(request.source_file)
        target_path = _resolve_key_file_path(request.target_file)
        if not source_path or not target_path:
            raise HTTPException(status_code=404, detail="Source or Target file not found")
        
        df_src = load_dataframe(source_path)
        if df_src is None or df_src.empty:
            df_src = pd.read_csv(source_path, low_memory=False)
        df_tgt = load_dataframe(target_path)
        if df_tgt is None or df_tgt.empty:
            df_tgt = pd.read_csv(target_path, low_memory=False)
        
        result = KeyDetectionEngine.validate_right_key(
            df_src, df_tgt, request.source_key, request.target_key
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/keys/analyze", response_model=FullKeyAnalysisResponse)
def analyze_key_pair(request: KeyValidationRequest):
    try:
        source_path = _resolve_key_file_path(request.source_file)
        target_path = _resolve_key_file_path(request.target_file)
        if not source_path or not target_path:
            raise HTTPException(status_code=404, detail="Source or Target file not found")
        
        df_src = load_dataframe(source_path)
        if df_src is None or df_src.empty:
            df_src = pd.read_csv(source_path, low_memory=False)
        df_tgt = load_dataframe(target_path)
        if df_tgt is None or df_tgt.empty:
            df_tgt = pd.read_csv(target_path, low_memory=False)
        
        # 1. Basic Validation
        basic = KeyDetectionEngine.validate_basic_key_integrity(
            df_src, df_tgt, request.source_key, request.target_key
        )
        
        if not basic.source_column_exists or not basic.target_column_exists:
            raise HTTPException(status_code=400, detail="One or both columns not found in files")
            
        # 2. Right Key Validation
        validation = KeyDetectionEngine.validate_right_key(
            df_src, df_tgt, request.source_key, request.target_key
        )
        
        # 3. Create dummy CandidateKeyPair for response structure consistency
        candidate = CandidateKeyPair(
            source_column=request.source_key,
            target_column=request.target_key,
            confidence=100.0 if validation.status == "VALID" else 50.0,
            explanation=validation.explanation,
            source_null_percent=round((basic.source_nulls_count / len(df_src)) * 100, 2) if len(df_src) > 0 else 0.0,
            target_null_percent=round((basic.target_nulls_count / len(df_tgt)) * 100, 2) if len(df_tgt) > 0 else 0.0,
            source_unique_percent=round(100.0 - ((basic.source_duplicates_count / len(df_src)) * 100), 2) if len(df_src) > 0 else 0.0,
            target_unique_percent=round(100.0 - ((basic.target_duplicates_count / len(df_tgt)) * 100), 2) if len(df_tgt) > 0 else 0.0,
            name_similarity=KeyDetectionEngine._calculate_name_similarity(request.source_key, request.target_key),
            value_overlap_ratio=validation.overlap_ratio,
            common_value_count=validation.common_keys_count
        )
        
        return FullKeyAnalysisResponse(
            candidate=candidate,
            validation=validation,
            basic_checks=basic
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SOURCE & FBDI MERGE WITH VALIDATION  (Bagal)
# =============================================================================

from app.services.source_fbdi_merge import run_merge_pipeline


@app.post("/api/v1/source-fbdi/merge")
async def api_merge_source_fbdi(
    source_file: Optional[UploadFile] = File(None),
    fbdi_file: Optional[UploadFile] = File(None),
    source_file_name: Optional[str] = Form(None),
    fbdi_file_name: Optional[str] = Form(None),
    source_key: Optional[str] = Form(None),
    fbdi_key: Optional[str] = Form(None),
):
    """
    Executes Source & FBDI Merge with LEFT JOIN on primary key.
    Calculates MATCH, MISMATCH, and MISSING records, and returns detailed metrics.
    Supports dynamic key override and robust normalization for non-Airetech files.
    """
    try:
        source_path = None
        fbdi_path = None

        if source_file and source_file.filename:
            save_src = os.path.join(UPLOAD_DIR, source_file.filename)
            with open(save_src, "wb") as buffer:
                shutil.copyfileobj(source_file.file, buffer)
            source_path = save_src
        elif source_file_name:
            candidate = os.path.join(UPLOAD_DIR, source_file_name)
            if os.path.exists(candidate):
                source_path = candidate

        if fbdi_file and fbdi_file.filename:
            save_fbdi = os.path.join(UPLOAD_DIR, fbdi_file.filename)
            with open(save_fbdi, "wb") as buffer:
                shutil.copyfileobj(fbdi_file.file, buffer)
            fbdi_path = save_fbdi
        elif fbdi_file_name:
            candidate = os.path.join(UPLOAD_DIR, fbdi_file_name)
            if os.path.exists(candidate):
                fbdi_path = candidate

        src_key = source_key.strip() if source_key and str(source_key).strip() not in ("", "null", "undefined") else None
        tgt_key = fbdi_key.strip() if fbdi_key and str(fbdi_key).strip() not in ("", "null", "undefined") else None

        out_path = os.path.join(UPLOAD_DIR, "merged_source_fbdi.xlsx")
        result = run_merge_pipeline(
            source_path=source_path,
            fbdi_path=fbdi_path,
            output_path=out_path,
            source_key=src_key,
            fbdi_key=tgt_key,
        )
        return JSONResponse(content=result)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/source-fbdi/download")
def api_download_merged_source_fbdi():
    """
    Downloads the merged Excel report containing all Source records,
    matching FBDI columns, Reconciliation_Status and Mismatch_Details.
    """
    candidates = [
        os.path.join(UPLOAD_DIR, "merged_source_fbdi.xlsx"),
        os.path.join(os.getcwd(), "merged_source_fbdi.xlsx"),
        "/app/merged_source_fbdi.xlsx",
        "/app/uploads/merged_source_fbdi.xlsx"
    ]
    for p in candidates:
        if os.path.exists(p):
            return FileResponse(
                p,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename="merged_source_fbdi.xlsx"
            )
    raise HTTPException(status_code=404, detail="Merged file not found. Please run the merge first.")


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
