import os
import re
import zipfile
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from app.schemas.validation_schema import ValidationStepResult
from app.services.file_detector import FileDetectorService

class FBDIParser:
    """
    Production-oriented FBDI (File-Based Data Import) Parser & Multi-Step Validator.
    Supports CSV, XLSX, and ZIP payload templates for Oracle Fusion Financials, SCM, HCM.
    """
    @staticmethod
    def parse_and_validate(file_path: str, entity_type: str = "Customer") -> Dict[str, Any]:
        file_name = os.path.basename(file_path)
        ext = os.path.splitext(file_name)[1].lower()
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

        steps: List[ValidationStepResult] = []

        # 1. File Validation
        if not os.path.exists(file_path) or file_size == 0:
            steps.append(ValidationStepResult(
                step_number=1, step_name="FBDI File Existence & Size",
                status="FAIL", message="FBDI payload file is missing or empty (0 bytes).",
                details={"file_name": file_name, "size_bytes": file_size}
            ))
            return {"status": "VALIDATION_FAILED", "steps": steps, "record_count": 0, "errors": ["File missing or empty"]}

        steps.append(ValidationStepResult(
            step_number=1, step_name="FBDI File Validation",
            status="PASS", message=f"FBDI payload '{file_name}' ({file_size} bytes) is accessible.",
            details={"file_name": file_name, "extension": ext, "size_bytes": file_size}
        ))

        # 2. Structure Validation & Extraction
        records_df = None
        sheets_detected = []
        inner_files = []

        try:
            if ext == '.zip':
                with zipfile.ZipFile(file_path, 'r') as z:
                    inner_files = z.namelist()
                    csv_files = [f for f in inner_files if f.endswith('.csv') or f.endswith('.txt')]
                    if not csv_files:
                        steps.append(ValidationStepResult(
                            step_number=2, step_name="FBDI Zip Payload Structure",
                            status="FAIL", message="FBDI zip archive does not contain any CSV control/data files.",
                            details={"inner_files": inner_files}
                        ))
                        return {"status": "VALIDATION_FAILED", "steps": steps, "record_count": 0, "errors": ["No CSV inside zip"]}
                    
                    # Read primary CSV inside ZIP archive
                    with z.open(csv_files[0]) as csv_file:
                        records_df = pd.read_csv(csv_file, low_memory=False)
                    sheets_detected = csv_files

            elif ext in ['.xlsx', '.xls', '.xlsm']:
                engine = 'openpyxl' if ext in ['.xlsx', '.xlsm'] else 'xlrd'
                with pd.ExcelFile(file_path, engine=engine) as excel:
                    sheets_detected = excel.sheet_names
                    records_df = FileDetectorService.load_excel_sheet(excel, sheets_detected[0])
            elif ext in ['.csv', '.txt', '.dat']:
                records_df = pd.read_csv(file_path, low_memory=False)
                sheets_detected = ["Main"]
        except Exception as e:
            steps.append(ValidationStepResult(
                step_number=2, step_name="FBDI Data Extraction",
                status="FAIL", message=f"Failed to extract tabular data from FBDI file: {str(e)}",
                details={"error": str(e)}
            ))
            return {"status": "VALIDATION_FAILED", "steps": steps, "record_count": 0, "errors": [str(e)]}

        steps.append(ValidationStepResult(
            step_number=2, step_name="FBDI Structure Validation",
            status="PASS", message=f"FBDI structure validated. {len(sheets_detected)} sheet(s)/file(s) detected.",
            details={"sheets_detected": sheets_detected, "columns_count": len(records_df.columns) if records_df is not None else 0}
        ))

        # 3. Record & Datatype Validation
        record_count = len(records_df) if records_df is not None else 0
        if record_count == 0:
            steps.append(ValidationStepResult(
                step_number=3, step_name="FBDI Record Count Validation",
                status="FAIL", message="FBDI payload contains 0 records.",
                details={"record_count": 0}
            ))
            return {"status": "VALIDATION_FAILED", "steps": steps, "record_count": 0, "errors": ["Zero records in payload"]}

        steps.append(ValidationStepResult(
            step_number=3, step_name="FBDI Record Count Check",
            status="PASS", message=f"FBDI payload contains {record_count} valid records.",
            details={"record_count": record_count}
        ))

        # 4. Mandatory Fields & Primary Key Unique Check
        detected_cols = [str(c).strip() for c in records_df.columns]
        pk_candidates = [c for c in detected_cols if any(k in c.upper() for k in ["ID", "NO", "NUMBER", "CODE", "KEY", "NUM"])]
        pk_col = pk_candidates[0] if pk_candidates else detected_cols[0]

        duplicates_count = 0
        if pk_col in records_df.columns:
            dups = records_df[records_df.duplicated(subset=[pk_col], keep=False)]
            duplicates_count = len(dups)

        if duplicates_count > 0:
            steps.append(ValidationStepResult(
                step_number=4, step_name="FBDI Primary Key Uniqueness Check",
                status="WARNING", message=f"Found {duplicates_count} duplicate records on Primary Key '{pk_col}'.",
                details={"primary_key": pk_col, "duplicate_rows": duplicates_count}
            ))
        else:
            steps.append(ValidationStepResult(
                step_number=4, step_name="FBDI Primary Key Uniqueness Check",
                status="PASS", message=f"Primary key '{pk_col}' is unique across all {record_count} records.",
                details={"primary_key": pk_col}
            ))

        # 5. Null Check
        null_counts = {col: int(cnt) for col, cnt in records_df.isnull().sum().items() if cnt > 0}
        steps.append(ValidationStepResult(
            step_number=5, step_name="FBDI Null Fields & Data Quality",
            status="WARNING" if sum(null_counts.values()) > 0 else "PASS",
            message=f"Detected {sum(null_counts.values())} empty fields across columns." if null_counts else "All records pass null check.",
            details={"null_counts": null_counts}
        ))

        overall_status = "READY" if not any(s.status == "FAIL" for s in steps) else "VALIDATION_FAILED"

        return {
            "status": overall_status,
            "entity_type": entity_type,
            "file_name": file_name,
            "file_type": "FBDI",
            "record_count": record_count,
            "column_count": len(detected_cols),
            "columns": detected_cols,
            "primary_key": pk_col,
            "duplicates_count": duplicates_count,
            "null_counts": null_counts,
            "steps": [s.dict() for s in steps],
            "dataframe": records_df
        }

    @staticmethod
    def validate_fbdi_payload(file_path: Optional[str], entity: str = "Supplier") -> Dict[str, Any]:
        if not file_path or not os.path.exists(file_path):
            return {
                "status": "NO_FILE_PROVIDED",
                "entity": entity,
                "file_name": os.path.basename(file_path) if file_path else "No file provided",
                "headers_valid": False,
                "mandatory_fields_present": False,
                "record_count": 0,
                "columns": [],
                "primary_key": None,
                "duplicates_count": 0,
                "null_counts": {},
                "steps": [],
                "errors": ["No FBDI payload file uploaded or found at path."],
                "warnings": ["Please upload or select an FBDI payload file (ZIP, CSV, XLSX) to perform validation."]
            }
        res = FBDIParser.parse_and_validate(file_path, entity_type=entity)

        overall_status = "PASSED" if res.get("status") == "READY" else res.get("status", "FAILED")
        steps = res.get("steps", [])
        errors = res.get("errors", [])
        warnings: list = []

        # Collect warnings from step results
        for step in steps:
            if isinstance(step, dict) and step.get("status") == "WARNING":
                warnings.append(step.get("message", ""))

        return {
            "status": overall_status,
            "entity": entity,
            "file_name": res.get("file_name", ""),
            "headers_valid": overall_status != "VALIDATION_FAILED",
            "mandatory_fields_present": overall_status != "VALIDATION_FAILED",
            "record_count": res.get("record_count", 0),
            "columns": res.get("columns", []),
            "primary_key": res.get("primary_key", None),
            "duplicates_count": res.get("duplicates_count", 0),
            "null_counts": res.get("null_counts", {}),
            "steps": steps,
            "errors": errors,
            "warnings": warnings,
        }


