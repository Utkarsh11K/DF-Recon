import os
import sys
import shutil

# Add backend directory to Python sys.path so 'app' package is found regardless of launch CWD
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.validation_schema import ValidationChainReport
from app.services.file_detector import FileDetectorService, SUPPORTED_EXTENSIONS
from app.services.validator_chain import ValidationChainEngine
from app.schemas.validation_schema import ValidationChainReport, DiscoveryResponse

app = FastAPI(
    title="FusionConvert / LightSpeed - Conversion & Reconciliation API",
    description="File Upload, Sheet Detection & Data Validation Execution Chain API (Step 1: Upload Files & Step 2: File & Sheet Detection)",
    version="1.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/health")
def health_check():
    return {"status": "HEALTHY", "service": "LightSpeed / FusionConvert Recon API"}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
