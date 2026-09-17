from pydantic import BaseModel, Field
from typing import List, Optional, Any

class CandidateKeyPair(BaseModel):
    source_column: str
    target_column: str
    confidence: float = Field(..., ge=0, le=100)
    explanation: str
    source_null_percent: float
    target_null_percent: float
    source_unique_percent: float
    target_unique_percent: float
    name_similarity: float
    value_overlap_ratio: float
    common_value_count: int = 0
    # Canonical fields per specification
    fbdi_column: Optional[str] = None
    common_values: Optional[int] = None
    data_overlap: Optional[float] = None
    nulls_percent: Optional[float] = None
    unique_percent: Optional[float] = None
    category: Optional[str] = None
    # Strict Candidate Key Gate fields
    recommendation: Optional[str] = None
    null_count: Optional[int] = None
    null_pct: Optional[float] = None
    column_names: Optional[List[str]] = None
    is_composite: Optional[bool] = False
    reason: Optional[str] = None

class KeyDetectionRequest(BaseModel):
    source_file: str
    target_file: str
    top_n: int = 5

class KeyDetectionResponse(BaseModel):
    candidates: List[CandidateKeyPair]
    all_source_columns: Optional[List[CandidateKeyPair]] = None
    single_col_candidates: Optional[List[CandidateKeyPair]] = None
    composite_candidates: Optional[List[CandidateKeyPair]] = None
    suggested_primary_key: Optional[List[str]] = None

class KeyPairEvaluationRequest(BaseModel):
    source_file: str
    target_file: str
    source_column: str
    target_column: str

class KeyValidationRequest(BaseModel):
    source_file: str
    target_file: str
    source_key: str
    target_key: str

class CustomKeyValidationRequest(BaseModel):
    source_file: str
    key_columns: List[str]

class CustomKeyValidationResult(BaseModel):
    is_valid: bool
    total_records: int
    unique_keys_count: int
    duplicate_key_count: int
    null_key_count: int
    blank_key_count: int
    uniqueness_pct: float
    duplicate_drilldown: List[Any]
    validation_checks: Any
    explanation: str

class RightKeyValidationResult(BaseModel):
    cardinality: str  # "1:1", "1:N", "N:M", "N:1"
    overlap_ratio: float
    common_keys_count: int
    orphan_source_count: int
    orphan_target_count: int
    status: str  # "VALID", "SUSPICIOUS", "INVALID"
    explanation: str

class BasicValidationCheck(BaseModel):
    source_column_exists: bool
    target_column_exists: bool
    source_nulls_count: int
    target_nulls_count: int
    source_duplicates_count: int
    target_duplicates_count: int
    types_compatible: bool

class FullKeyAnalysisResponse(BaseModel):
    candidate: CandidateKeyPair
    validation: RightKeyValidationResult
    basic_checks: BasicValidationCheck


class TargetDirectedKeyDetectionRequest(BaseModel):
    source_file: str
    target_file: str
    target_column: str = "*Customer Name"
    target_sheet: Optional[str] = None
    source_sheet: Optional[str] = None


class TargetKeyMatchResult(BaseModel):
    source_column: str
    target_column: str
    common_values: int
    data_overlap: float
    match_ratio: float
    null_pct: float
    null_count: int
    unique_count: int
    duplicate_count: int
    duplicate_status: str
    confidence: float
    validation: str
    candidate_status: str
    reason: str
    source_record_count: int
    target_record_count: int


class TargetDirectedKeyDetectionResponse(BaseModel):
    best_match: Optional[TargetKeyMatchResult]
    all_evaluated_columns: List[TargetKeyMatchResult]
    target_column: str
    source_file: str
    target_file: str
    target_sheet: Optional[str] = None
    source_sheet: Optional[str] = None

