import os
import sys
import shutil

backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.validation_schema import ValidationChainReport, DiscoveryResponse
from app.schemas.business_rules_schema import BusinessRule, BusinessRuleValidationRequest, BusinessValidationReport
from app.services.file_detector import FileDetectorService, SUPPORTED_EXTENSIONS
from app.services.validator_chain import ValidationChainEngine
from app.services.file_loader import load_dataframe
from app.services.business_rules import BusinessRuleEngine, get_core_rules, CORE_RULES_BY_ID

app = FastAPI(
    title="DF-Recon Merged API",
    description="File Upload, Sheet Detection & Data Validation API (Goraksha) + DB Schema (Utkarsha)",
    version="2.0.0"
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


@app.get("/health")
def health_check():
    return {"status": "HEALTHY", "service": "DF-Recon Merged API"}


@app.get("/api/v1/db/status")
def db_status():
    """Check PostgreSQL connectivity (Utkarsha's schema)."""
    if not DATABASE_URL:
        return {"connected": False, "reason": "DATABASE_URL not set"}
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;")
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

@app.post("/api/v1/upload-file", response_model=ValidationChainReport)
async def upload_and_validate_file(
    file: UploadFile = File(...),
    file_type: str = Form("SOURCE"), # SOURCE or TARGET_EXTRACT
    required_columns: Optional[str] = Form(None), # Comma separated column names
    primary_key_column: Optional[str] = Form(None)
):
    """
    Uploads a single file (Source or Target Extract), detects sheets, and executes validation chain.
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
    Executes Folder Validation -> File Validation -> Data Validation Execution Chain.
    """
    report = ValidationChainEngine.execute_validation_chain(
        folder_path=folder_path,
        target_file_name=target_file_name,
        required_columns=required_columns,
        primary_key_column=primary_key_column
    )
    return report

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
            detail=f"Uploaded file '{payload.file_name}' was not found on the server. "
                   f"Please re-upload it in the Discovery step and try again.",
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
