from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class SheetDetectionResult(BaseModel):
    sheet_name: str
    record_count: int = 0
    column_count: int = 0
    columns: List[str] = Field(default_factory=list)
    sample_data: List[Dict[str, Any]] = Field(default_factory=list)

class FileDetectionResult(BaseModel):
    file_name: str
    file_path: Optional[str] = None
    file_extension: str
    file_size_bytes: int
    is_supported: bool
    file_type: str = "SOURCE" # SOURCE or TARGET_EXTRACT
    mime_type: Optional[str] = None
    delimiter: Optional[str] = None
    encoding: Optional[str] = None
    sheet_count: int = 0
    sheets: List[SheetDetectionResult] = Field(default_factory=list)
    inner_files: List[str] = Field(default_factory=list) # For zip archives

class ValidationStepResult(BaseModel):
    step_number: int
    step_name: str
    status: str # PASS, FAIL, WARNING, SKIPPED
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)

class ValidationChainReport(BaseModel):
    folder_path: str
    folder_exists: bool
    has_supported_file: bool
    overall_status: str # PASS, FAIL, WARNING
    file_info: Optional[FileDetectionResult] = None
    validation_steps: List[ValidationStepResult] = Field(default_factory=list)
    record_count: int = 0
    duplicate_records_count: int = 0
    null_values_summary: Dict[str, int] = Field(default_factory=dict)
    missing_required_columns: List[str] = Field(default_factory=list)
    execution_time_ms: float = 0.0

class DiscoveryResponse(BaseModel):
    batch_id: Optional[str] = "Batch_001"
    folder_path: Optional[str] = None
    source_file_info: Optional[FileDetectionResult] = None
    target_file_info: Optional[FileDetectionResult] = None
    discovered_files: List[FileDetectionResult] = Field(default_factory=list)
    source_validation_report: Optional[ValidationChainReport] = None
    target_validation_report: Optional[ValidationChainReport] = None
    overall_status: str = "READY"

# ── Fusion Extract ────────────────────────────────────────────────────────────

class FusionExtractPreparation(BaseModel):
    file_name: str
    entity: str = "Customer"
    project_name: Optional[str] = None
    wave_name: Optional[str] = None
    opco_name: Optional[str] = None
    module_name: Optional[str] = None
    execution_timestamp: str = "20260902143000"
    expected_execution_timestamp: str = "20260902143000"
    execution_match: bool = True
    status: str = "MATCHED" # MATCHED or EXECUTION_MISMATCH
    record_count: int = 0
    message: str = "Execution timestamps match."

# ── Backend Reconciliation ────────────────────────────────────────────────────

class ReconciliationRequest(BaseModel):
    batch_id: str = "Batch_001"
    project_id: Optional[int] = 1
    wave_id: Optional[int] = 1
    opco_id: Optional[int] = 1
    module_id: Optional[int] = 1
    entity_id: Optional[int] = 1
    source_key: str = "CUST_NO"
    target_key: str = "ACCOUNT_NUMBER"
    expected_execution_timestamp: Optional[str] = "20260902143000"
    fusion_execution_timestamp: Optional[str] = "20260902143000"
    source_file_path: Optional[str] = None
    target_file_path: Optional[str] = None

class FieldDifference(BaseModel):
    record_key: str
    field_name: str
    expected_value: Any
    oracle_value: Any
    status: str = "MISMATCH"

class ReconciliationRecordDetail(BaseModel):
    id: str
    key: str
    field: str
    sourceValue: str
    targetValue: str
    type: str # value_mismatch, missing_source, missing_target, not_loaded, duplicate

class ColumnSummaryMetric(BaseModel):
    column: str
    matched: int = 0
    mismatched: int = 0
    missingSource: int = 0
    missingTarget: int = 0

class ReconciliationReportResponse(BaseModel):
    recon_run_id: str
    batch_id: str
    runAt: str
    execution_timestamp: str
    execution_match: bool = True
    status: str = "COMPLETED" # COMPLETED, EXECUTION_MISMATCH, FAILED
    totalSource: int = 0
    totalTarget: int = 0
    matched: int = 0
    unmatchedSource: int = 0 # MISSING_IN_ORACLE
    unmatchedTarget: int = 0 # EXTRA_IN_ORACLE
    mismatched: int = 0 # MISMATCH
    duplicates: int = 0
    notLoaded: int = 0 # NOT_LOADED
    validationFailed: int = 0
    matchRate: float = 0.0
    qualityGrade: str = "A+"
    discrepancies: List[ReconciliationRecordDetail] = Field(default_factory=list)
    field_differences: List[FieldDifference] = Field(default_factory=list)
    summary: List[ColumnSummaryMetric] = Field(default_factory=list)
    message: str = "Reconciliation completed successfully on backend."
