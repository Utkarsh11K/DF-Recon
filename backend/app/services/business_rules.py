"""
Business validation rules engine.

Design:
  - CORE_RULES is a plain data catalog (CUS001-CUS010) — no rule-specific
    branching lives in React/Python call sites, only here.
  - BusinessRuleEngine.evaluate() is entity-agnostic: it evaluates whatever
    BusinessRule objects it's given (core or dynamic/user-created) against a
    pandas DataFrame for one entity at a time. Customer, Supplier, Employee,
    or any future entity all go through the same evaluate() path.
  - A rule whose field(s) don't exist in the uploaded data never silently
    passes: core rules are marked NOT_APPLICABLE (skipped, per spec "make
    them ... applicable only when the required field exists"), while
    dynamic/user-created rules are marked ERROR so the gap is visible.
"""
import re
from typing import List, Optional, Any, Tuple
import pandas as pd

from app.schemas.business_rules_schema import (
    BusinessRule, RuleResult, RuleSummary, BusinessValidationReport,
)

EMAIL_PATTERN = r'^[^@\s]+@[^@\s]+\.[^@\s]+$'
PHONE_PATTERN = r'^[+0-9()\-\s]{7,20}$'

MAX_RESULTS_RETURNED = 500

CORE_RULES: List[BusinessRule] = [
    BusinessRule(rule_id="CUS001", rule_name="Address Line 1 Required", entity="Customer",
                 field="ADDRESS_LINE_1", rule_type="required", severity="error", is_core=True,
                 description="ADDRESS_LINE_1 must not be null/blank."),
    BusinessRule(rule_id="CUS002", rule_name="Account Description = Customer Name", entity="Customer",
                 field="ACCOUNT_DESCRIPTION", target_field="CUSTOMER_NAME", rule_type="equals_field",
                 severity="error", is_core=True,
                 description="ACCOUNT_DESCRIPTION must equal CUSTOMER_NAME."),
    BusinessRule(rule_id="CUS003", rule_name="Bill To Required", entity="Customer",
                 field="BILL_TO", rule_type="equals_value", expected_value="Y", severity="error",
                 is_core=True, description="BILL_TO must equal Y."),
    BusinessRule(rule_id="CUS004", rule_name="Ship To Required", entity="Customer",
                 field="SHIP_TO", rule_type="equals_value", expected_value="Y", severity="error",
                 is_core=True, description="SHIP_TO must equal Y."),
    BusinessRule(rule_id="CUS005", rule_name="Customer Name Required", entity="Customer",
                 field="CUSTOMER_NAME", rule_type="required", severity="error", is_core=True,
                 description="CUSTOMER_NAME must not be null/blank."),
    BusinessRule(rule_id="CUS006", rule_name="Primary/Business Key Required & Unique", entity="Customer",
                 field=None, rule_type="key_unique", severity="error", is_core=True,
                 description="The configured primary/business key must exist and be unique."),
    BusinessRule(rule_id="CUS007", rule_name="Email Format Valid", entity="Customer",
                 field="EMAIL", rule_type="regex", operator=EMAIL_PATTERN, severity="warning",
                 is_core=True, description="If an email field exists, validate its format."),
    BusinessRule(rule_id="CUS008", rule_name="Phone Format Valid", entity="Customer",
                 field="PHONE", rule_type="regex", operator=PHONE_PATTERN, severity="warning",
                 is_core=True, description="If a phone field exists, validate its basic format."),
    BusinessRule(rule_id="CUS009", rule_name="Country Required", entity="Customer",
                 field="COUNTRY", rule_type="required", severity="error", is_core=True,
                 description="COUNTRY must not be null/blank."),
    BusinessRule(rule_id="CUS010", rule_name="Duplicate Customer ID Not Allowed", entity="Customer",
                 field="CUSTOMER_ID", rule_type="unique_field", severity="error", is_core=True,
                 description="Customer/business ID must not contain duplicates."),
]

CORE_RULES_BY_ID = {r.rule_id: r for r in CORE_RULES}


def get_core_rules(entity: Optional[str] = None) -> List[BusinessRule]:
    if entity:
        return [r for r in CORE_RULES if r.entity.lower() == entity.lower()]
    return list(CORE_RULES)


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    try:
        if pd.isna(value):
            return True
    except (TypeError, ValueError):
        pass
    return str(value).strip() == ""


def _record_key(row: "pd.Series", key_field: Optional[str], idx: Any) -> str:
    if key_field and key_field in row.index and not _is_blank(row[key_field]):
        return str(row[key_field]).strip()
    return f"ROW_{idx}"


def _build_result(
    rule: BusinessRule, row: "pd.Series", key_field: Optional[str], idx: Any,
    ok: bool, reason: Optional[str], field_for_tag: Optional[str],
) -> RuleResult:
    key = _record_key(row, key_field, idx)
    tag_field = (field_for_tag or rule.rule_id).upper().replace(" ", "_")
    tag = f"{tag_field}_VALID" if ok else f"{tag_field}_INVALID"
    return RuleResult(
        entity=rule.entity,
        record_key=key,
        rule_id=rule.rule_id,
        rule_name=rule.rule_name,
        status="PASS" if ok else "FAIL",
        severity=rule.severity,
        failure_reason=reason,
        tag=tag,
    )


class BusinessRuleEngine:
    """Evaluates BusinessRule definitions (core + dynamic) against a pandas
    DataFrame for a given entity. No entity-specific branching lives here —
    only in the rule *data* — so the same engine serves Customer, Supplier,
    Employee, or any future entity.
    """

    @staticmethod
    def evaluate(
        df: pd.DataFrame,
        rules: List[BusinessRule],
        entity: str,
        primary_key_column: Optional[str] = None,
    ) -> BusinessValidationReport:
        record_count = len(df)
        summaries: List[RuleSummary] = []
        all_results: List[RuleResult] = []

        applicable_rules = [r for r in rules if r.enabled and r.entity.lower() == entity.lower()]

        for rule in applicable_rules:
            summary, results = BusinessRuleEngine._evaluate_rule(df, rule, primary_key_column)
            summaries.append(summary)
            all_results.extend(results)

        # Surface failures first in the (capped) payload sent to the client.
        all_results.sort(key=lambda r: 0 if r.status == "FAIL" else 1)
        truncated = len(all_results) > MAX_RESULTS_RETURNED
        capped_results = all_results[:MAX_RESULTS_RETURNED]

        overall_status = "FAIL" if any(s.status == "FAIL" for s in summaries) else "PASS"

        return BusinessValidationReport(
            entity=entity,
            primary_key_column=primary_key_column,
            record_count=record_count,
            rules_evaluated=len(summaries),
            overall_status=overall_status,
            rule_summaries=summaries,
            results=capped_results,
            results_truncated=truncated,
        )

    @staticmethod
    def _missing_fields(df: pd.DataFrame, rule: BusinessRule, primary_key_column: Optional[str]) -> List[str]:
        needed: List[str] = []
        if rule.rule_type == "key_unique":
            if primary_key_column:
                needed.append(primary_key_column)
        else:
            if rule.field:
                needed.append(rule.field)
            if rule.rule_type == "equals_field" and rule.target_field:
                needed.append(rule.target_field)
        return [f for f in needed if f not in df.columns]

    @staticmethod
    def _evaluate_rule(
        df: pd.DataFrame, rule: BusinessRule, primary_key_column: Optional[str]
    ) -> Tuple[RuleSummary, List[RuleResult]]:
        key_field = primary_key_column if (primary_key_column and primary_key_column in df.columns) else None

        if rule.rule_type == "key_unique" and not primary_key_column:
            return RuleSummary(
                rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
                severity=rule.severity, rule_type=rule.rule_type, status="NOT_APPLICABLE",
                applicable=False,
                message="No primary/business key configured for this entity — rule skipped.",
            ), []

        missing = BusinessRuleEngine._missing_fields(df, rule, primary_key_column)
        if missing:
            if rule.is_core:
                return RuleSummary(
                    rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
                    severity=rule.severity, rule_type=rule.rule_type, status="NOT_APPLICABLE",
                    applicable=False,
                    message=f"Field(s) {', '.join(missing)} not present in uploaded data — rule skipped.",
                ), []
            # Dynamic (user-created) rules must never silently pass when their field is gone.
            return RuleSummary(
                rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
                severity=rule.severity, rule_type=rule.rule_type, status="ERROR",
                applicable=False,
                message=f"Field(s) {', '.join(missing)} not found in uploaded data.",
            ), []

        if df.empty:
            return RuleSummary(
                rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
                severity=rule.severity, rule_type=rule.rule_type, status="PASS",
                total_evaluated=0, message="No records to evaluate.",
            ), []

        results: List[RuleResult] = []

        if rule.rule_type in ("unique_field", "key_unique"):
            field = primary_key_column if rule.rule_type == "key_unique" else rule.field
            dup_mask = df.duplicated(subset=[field], keep=False)
            for idx, row in df.iterrows():
                blank = _is_blank(row[field])
                is_dup = bool(dup_mask.loc[idx]) and not blank
                ok = (not blank if rule.rule_type == "key_unique" else True) and not is_dup
                reason = None
                if blank and rule.rule_type == "key_unique":
                    reason = f"{field} is missing/blank"
                elif is_dup:
                    reason = f"{field} value is duplicated"
                results.append(_build_result(rule, row, key_field, idx, ok, reason, field))

        elif rule.rule_type == "required":
            for idx, row in df.iterrows():
                ok = not _is_blank(row[rule.field])
                reason = None if ok else f"{rule.field} is missing/blank"
                results.append(_build_result(rule, row, key_field, idx, ok, reason, rule.field))

        elif rule.rule_type == "equals_value":
            expected = str(rule.expected_value).strip() if rule.expected_value is not None else ""
            for idx, row in df.iterrows():
                val = "" if _is_blank(row[rule.field]) else str(row[rule.field]).strip()
                ok = val == expected
                reason = None if ok else f"{rule.field} ('{val}') does not equal expected value '{expected}'"
                results.append(_build_result(rule, row, key_field, idx, ok, reason, rule.field))

        elif rule.rule_type == "equals_field":
            for idx, row in df.iterrows():
                a = "" if _is_blank(row[rule.field]) else str(row[rule.field]).strip()
                b = "" if _is_blank(row[rule.target_field]) else str(row[rule.target_field]).strip()
                ok = a == b
                reason = None if ok else f"{rule.field} ('{a}') does not equal {rule.target_field} ('{b}')"
                results.append(_build_result(rule, row, key_field, idx, ok, reason, rule.field))

        elif rule.rule_type == "regex":
            pattern = rule.operator or ".*"
            try:
                compiled = re.compile(pattern)
            except re.error:
                return RuleSummary(
                    rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
                    severity=rule.severity, rule_type=rule.rule_type, status="ERROR",
                    applicable=False, message=f"Invalid regex pattern: {pattern}",
                ), []
            for idx, row in df.iterrows():
                if _is_blank(row[rule.field]):
                    ok, reason = True, None  # blank values belong to a separate "required" rule
                else:
                    ok = bool(compiled.match(str(row[rule.field]).strip()))
                    reason = None if ok else f"{rule.field} ('{row[rule.field]}') does not match expected format"
                results.append(_build_result(rule, row, key_field, idx, ok, reason, rule.field))

        else:
            return RuleSummary(
                rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
                severity=rule.severity, rule_type=rule.rule_type, status="ERROR",
                applicable=False, message=f"Unknown rule_type '{rule.rule_type}'.",
            ), []

        pass_count = sum(1 for r in results if r.status == "PASS")
        fail_count = sum(1 for r in results if r.status == "FAIL")
        status = "FAIL" if fail_count > 0 else "PASS"

        return RuleSummary(
            rule_id=rule.rule_id, rule_name=rule.rule_name, entity=rule.entity,
            severity=rule.severity, rule_type=rule.rule_type, status=status,
            pass_count=pass_count, fail_count=fail_count, total_evaluated=len(results),
        ), results
