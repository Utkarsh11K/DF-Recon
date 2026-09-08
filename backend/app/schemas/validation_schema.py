from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class SheetDetectionResult(BaseModel):
    sheet_name: str
    record_count: int = 0
    column_count: int = 0
    columns: List[str] = Field(default_factory=list)

class FileDetectionResult(BaseModel):
    file_name: str
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
    source_file_info: Optional[FileDetectionResult] = None
    target_file_info: Optional[FileDetectionResult] = None
    source_validation_report: Optional[ValidationChainReport] = None
    target_validation_report: Optional[ValidationChainReport] = None
    overall_status: str = "READY"
