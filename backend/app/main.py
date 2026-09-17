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
from fastapi.responses import StreamingResponse, JSONResponse
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

# ── Services ──────────────────────────────────────────────────────────────────
from app.services.file_detector import FileDetectorService, SUPPORTED_EXTENSIONS
from app.services.validator_chain import ValidationChainEngine
from app.services.file_loader import load_dataframe
from app.services.business_rules import BusinessRuleEngine, get_core_rules, CORE_RULES_BY_ID
from app.services.github_connector import GitHubConnectorError, GitHubConnectorService

# ── Engine Layer ──────────────────────────────────────────────────────────────
from app.engine.fbdi_hdl_parser import FBDIParser
from app.services.fusion_extract_service import FusionExtractService
from app.services.reconciliation_engine import BackendReconciliationEngine


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
    primary_key_column: Optional[str] = Form(None)
):
    """
    Uploads a single file (Source or Target Extract), detects sheets,
    and executes the full validation chain.
    """
    req_cols = [c.strip() for c in required_columns.split(",")] if required_columns else []

    file_location = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    report = ValidationChainEngine.execute_validation_chain(
        folder_path=UPLOAD_DIR,
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

        # Process Source File
        if source_file and source_file.filename:
            src_path = os.path.join(UPLOAD_DIR, source_file.filename)
            with open(src_path, "wb") as buffer:
                shutil.copyfileobj(source_file.file, buffer)

            response.source_file_info = FileDetectorService.detect_file_and_sheets(src_path, file_type="SOURCE")
            response.source_validation_report = ValidationChainEngine.execute_validation_chain(
                folder_path=UPLOAD_DIR,
                target_file_name=source_file.filename,
                file_type="SOURCE"
            )

        # Process Target Extract File (Fusion Extract)
        if target_file and target_file.filename:
            tgt_path = os.path.join(UPLOAD_DIR, target_file.filename)
            with open(tgt_path, "wb") as buffer:
                shutil.copyfileobj(target_file.file, buffer)

            response.target_file_info = FileDetectorService.detect_file_and_sheets(tgt_path, file_type="TARGET_EXTRACT")
            response.target_validation_report = ValidationChainEngine.execute_validation_chain(
                folder_path=UPLOAD_DIR,
                target_file_name=target_file.filename,
                file_type="TARGET_EXTRACT"
            )

        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File Processing Error: {str(e)}")


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

        def in_source_architecture(info: FileDetectionResult) -> bool:
            path = (info.file_path or info.file_name or '').lower().replace('\\', '/')
            return any(token in path for token in ['01-source', '/source/', '/src/', '01-source/', 'source/', 'src/'])

        def in_fusion_architecture(info: FileDetectionResult) -> bool:
            path = (info.file_path or info.file_name or '').lower().replace('\\', '/')
            return any(token in path for token in ['04-fusion', '/fusion/', '04-fusion/', 'fusion/', 'target_extract', '/target/', '/tgt/', 'target/', 'tgt/'])

        source_candidates = [f for f in detected_list if in_source_architecture(f)]
        target_candidates = [f for f in detected_list if in_fusion_architecture(f)]

        # Prefer the first explicit architecture match.
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


from app.services.source_fbdi_merge import run_merge_pipeline


# =============================================================================
# SOURCE & FBDI MERGE WITH VALIDATION (Priti)
# =============================================================================

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
