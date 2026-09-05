import os
import time
import pandas as pd
from typing import List, Optional, Dict, Any
from app.schemas.validation_schema import (
    ValidationChainReport,
    ValidationStepResult,
    FileDetectionResult
)
from app.services.file_detector import FileDetectorService, SUPPORTED_EXTENSIONS

class ValidationChainEngine:
    @staticmethod
    def execute_validation_chain(
        folder_path: str,
        target_file_name: Optional[str] = None,
        file_type: str = "SOURCE",
        required_columns: Optional[List[str]] = None,
        primary_key_column: Optional[str] = None
    ) -> ValidationChainReport:
        start_time = time.time()
        steps: List[ValidationStepResult] = []
        required_columns = required_columns or []

        # -------------------------------------------------------------
        # STEP 1: Folder Validation
        # -------------------------------------------------------------
        folder_exists = os.path.exists(folder_path) and os.path.isdir(folder_path)
        if not folder_exists:
            steps.append(ValidationStepResult(
                step_number=1,
                step_name="Folder Validation",
                status="FAIL",
                message=f"Folder path '{folder_path}' does not exist or is not a directory.",
                details={"folder_path": folder_path}
            ))
            return ValidationChainReport(
                folder_path=folder_path,
                folder_exists=False,
                has_supported_file=False,
                overall_status="FAIL",
                validation_steps=steps,
                execution_time_ms=round((time.time() - start_time) * 1000, 2)
            )
        
        steps.append(ValidationStepResult(
            step_number=1,
            step_name="Folder Validation",
            status="PASS",
            message=f"Folder path '{folder_path}' exists.",
            details={"folder_path": folder_path}
        ))

        # -------------------------------------------------------------
        # STEP 2: File Validation (Does at least one supported file exist?)
        # -------------------------------------------------------------
        folder_files = os.listdir(folder_path)
        supported_files = [
            f for f in folder_files 
            if os.path.isfile(os.path.join(folder_path, f)) and FileDetectorService.is_supported_file(f)
        ]

        if not supported_files:
            steps.append(ValidationStepResult(
                step_number=2,
                step_name="File Format Validation",
                status="FAIL",
                message=f"No supported file found in folder. Supported formats: {sorted(list(SUPPORTED_EXTENSIONS))}",
                details={"found_files": folder_files}
            ))
            return ValidationChainReport(
                folder_path=folder_path,
                folder_exists=True,
                has_supported_file=False,
                overall_status="FAIL",
                validation_steps=steps,
                execution_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        # Select target file: either specified file or first supported file
        selected_file_name = target_file_name if target_file_name in supported_files else supported_files[0]
        selected_file_path = os.path.join(folder_path, selected_file_name)

        steps.append(ValidationStepResult(
            step_number=2,
            step_name="File Format Validation",
            status="PASS",
            message=f"Found supported file '{selected_file_name}'. Total supported files: {len(supported_files)}",
            details={"selected_file": selected_file_name, "all_supported_files": supported_files}
        ))

        # Detect File & Sheet Meta
        file_info: FileDetectionResult = FileDetectorService.detect_file_and_sheets(selected_file_path, file_type=file_type)

        # -------------------------------------------------------------
        # STEP 3: File Size > 0
        # -------------------------------------------------------------
        if file_info.file_size_bytes == 0:
            steps.append(ValidationStepResult(
                step_number=3,
                step_name="File Size Validation",
                status="FAIL",
                message=f"File '{selected_file_name}' is empty (0 bytes).",
                details={"file_size_bytes": 0}
            ))
            return ValidationChainReport(
                folder_path=folder_path,
                folder_exists=True,
                has_supported_file=True,
                overall_status="FAIL",
                file_info=file_info,
                validation_steps=steps,
                execution_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        steps.append(ValidationStepResult(
            step_number=3,
            step_name="File Size Validation",
            status="PASS",
            message=f"File size is valid: {file_info.file_size_bytes} bytes.",
            details={"file_size_bytes": file_info.file_size_bytes}
        ))

        # Read Tabular Data for Data Validation Execution Chain
        df = ValidationChainEngine._load_dataframe(selected_file_path, file_info)
        total_records = len(df) if df is not None else 0

        # -------------------------------------------------------------
        # STEP 4: Record Count > 0
        # -------------------------------------------------------------
        if total_records == 0:
            steps.append(ValidationStepResult(
                step_number=4,
                step_name="Record Count Validation",
                status="FAIL",
                message=f"File '{selected_file_name}' contains 0 records.",
                details={"record_count": 0}
            ))
            return ValidationChainReport(
                folder_path=folder_path,
                folder_exists=True,
                has_supported_file=True,
                overall_status="FAIL",
                file_info=file_info,
                validation_steps=steps,
                execution_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        steps.append(ValidationStepResult(
            step_number=4,
            step_name="Record Count Validation",
            status="PASS",
            message=f"Record count is valid: {total_records} rows.",
            details={"record_count": total_records}
        ))

        # -------------------------------------------------------------
        # STEP 5: Required Columns Available Check
        # -------------------------------------------------------------
        detected_columns = [str(c) for c in df.columns.tolist()] if df is not None else []
        missing_cols = [col for col in required_columns if col not in detected_columns]

        if missing_cols:
            steps.append(ValidationStepResult(
                step_number=5,
                step_name="Required Columns Check",
                status="FAIL",
                message=f"Missing required columns: {missing_cols}",
                details={"required_columns": required_columns, "missing_columns": missing_cols, "detected_columns": detected_columns}
            ))
        else:
            steps.append(ValidationStepResult(
                step_number=5,
                step_name="Required Columns Check",
                status="PASS",
                message="All required columns are present.",
                details={"required_columns": required_columns, "detected_columns": detected_columns}
            ))

        # -------------------------------------------------------------
        # STEP 6: Duplicate Records Check
        # -------------------------------------------------------------
        duplicate_count = 0
        duplicate_details = {}

        if df is not None and not df.empty:
            if primary_key_column and primary_key_column in df.columns:
                pk_dups = df[df.duplicated(subset=[primary_key_column], keep=False)]
                duplicate_count = len(pk_dups)
                duplicate_details = {"check_type": "PRIMARY_KEY", "primary_key": primary_key_column, "duplicate_rows_count": duplicate_count}
            else:
                full_dups = df[df.duplicated(keep=False)]
                duplicate_count = len(full_dups)
                duplicate_details = {"check_type": "FULL_ROW", "duplicate_rows_count": duplicate_count}

        if duplicate_count > 0:
            steps.append(ValidationStepResult(
                step_number=6,
                step_name="Duplicate Records Check",
                status="WARNING",
                message=f"Found {duplicate_count} duplicate records.",
                details=duplicate_details
            ))
        else:
            steps.append(ValidationStepResult(
                step_number=6,
                step_name="Duplicate Records Check",
                status="PASS",
                message="No duplicate records detected.",
                details=duplicate_details
            ))

        # -------------------------------------------------------------
        # STEP 7: Null Values Check
        # -------------------------------------------------------------
        null_counts: Dict[str, int] = {}
        total_nulls = 0

        if df is not None and not df.empty:
            null_series = df.isnull().sum()
            null_counts = {col: int(cnt) for col, cnt in null_series.items() if cnt > 0}
            total_nulls = sum(null_counts.values())

        if total_nulls > 0:
            steps.append(ValidationStepResult(
                step_number=7,
                step_name="Null Values Check",
                status="WARNING",
                message=f"Detected {total_nulls} null/empty fields across columns.",
                details={"null_counts_per_column": null_counts, "total_nulls": total_nulls}
            ))
        else:
            steps.append(ValidationStepResult(
                step_number=7,
                step_name="Null Values Check",
                status="PASS",
                message="No null values detected.",
                details={"total_nulls": 0}
            ))

        # Overall Status Calculation
        has_fail = any(s.status == "FAIL" for s in steps)
        has_warning = any(s.status == "WARNING" for s in steps)
        overall_status = "FAIL" if has_fail else ("WARNING" if has_warning else "PASS")

        return ValidationChainReport(
            folder_path=folder_path,
            folder_exists=True,
            has_supported_file=True,
            overall_status=overall_status,
            file_info=file_info,
            validation_steps=steps,
            record_count=total_records,
            duplicate_records_count=duplicate_count,
            null_values_summary=null_counts,
            missing_required_columns=missing_cols,
            execution_time_ms=round((time.time() - start_time) * 1000, 2)
        )

    @staticmethod
    def _load_dataframe(file_path: str, file_info: FileDetectionResult) -> Optional[pd.DataFrame]:
        ext = file_info.file_extension.lower()
        try:
            if ext in ['.xlsx', '.xls']:
                engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
                return pd.read_excel(file_path, engine=engine)
            elif ext in ['.csv', '.txt', '.dat']:
                delimiter = file_info.delimiter or ','
                encoding = file_info.encoding or 'utf-8'
                return pd.read_csv(file_path, sep=delimiter, encoding=encoding, low_memory=False)
            elif ext == '.json':
                return pd.read_json(file_path)
            elif ext == '.xml':
                return pd.read_xml(file_path)
        except Exception:
            return None
        return None
