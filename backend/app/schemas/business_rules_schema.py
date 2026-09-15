from typing import List, Optional
from pydantic import BaseModel, Field

# Supported rule_type values:
#   required     - field must not be null/blank
#   equals_value - field must equal `expected_value`
#   equals_field  - field must equal the value of `target_field`
#   regex        - field, if non-blank, must match the pattern in `operator`
#   unique_field - `field` must not contain duplicate values
#   key_unique   - the configured primary/business key must exist, be
#                  non-blank, and be unique (used by CUS006)


class BusinessRule(BaseModel):
    rule_id: str
    rule_name: str
    entity: str
    field: Optional[str] = None
    target_field: Optional[str] = None       # used by equals_field
    rule_type: str
    operator: Optional[str] = None           # e.g. regex pattern for rule_type == "regex"
    expected_value: Optional[str] = None      # used by equals_value
    severity: str = "error"                  # error | warning | info
    enabled: bool = True
    is_core: bool = False
    description: Optional[str] = None


class RuleResult(BaseModel):
    entity: str
    record_key: str
    rule_id: str
    rule_name: str
    status: str                              # PASS | FAIL
    severity: str
    failure_reason: Optional[str] = None
    tag: str


class RuleSummary(BaseModel):
    rule_id: str
    rule_name: str
    entity: str
    severity: str
    rule_type: str
    status: str                              # PASS | FAIL | NOT_APPLICABLE | ERROR
    pass_count: int = 0
    fail_count: int = 0
    total_evaluated: int = 0
    applicable: bool = True
    message: Optional[str] = None


class BusinessRuleValidationRequest(BaseModel):
    file_name: str
    entity: str
    primary_key_column: Optional[str] = None
    core_rule_ids: List[str] = Field(default_factory=list)
    dynamic_rules: List[BusinessRule] = Field(default_factory=list)


class BusinessValidationReport(BaseModel):
    entity: str
    primary_key_column: Optional[str] = None
    record_count: int = 0
    rules_evaluated: int = 0
    overall_status: str = "PASS"             # PASS | FAIL
    rule_summaries: List[RuleSummary] = Field(default_factory=list)
    results: List[RuleResult] = Field(default_factory=list)
    results_truncated: bool = False
