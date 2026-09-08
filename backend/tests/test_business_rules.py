import os
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app, UPLOAD_DIR
from app.services.business_rules import BusinessRuleEngine, get_core_rules, CORE_RULES_BY_ID
from app.schemas.business_rules_schema import BusinessRule

client = TestClient(app)


def _summary(report, rule_id):
    return next(s for s in report.rule_summaries if s.rule_id == rule_id)


# ── CUS001: Address Line 1 Required ────────────────────────────────────────

def test_cus001_pass_and_fail():
    df = pd.DataFrame({
        "CUSTOMER_ID": ["C001", "C002"],
        "ADDRESS_LINE_1": ["123 Main St", ""],
    })
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS001"]], "Customer", "CUSTOMER_ID")
    s = _summary(report, "CUS001")
    assert s.status == "FAIL"
    assert s.pass_count == 1
    assert s.fail_count == 1
    fail = next(r for r in report.results if r.rule_id == "CUS001" and r.status == "FAIL")
    assert fail.record_key == "C002"
    assert fail.tag == "ADDRESS_LINE_1_INVALID"


def test_cus001_all_pass():
    df = pd.DataFrame({"CUSTOMER_ID": ["C001"], "ADDRESS_LINE_1": ["123 Main St"]})
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS001"]], "Customer", "CUSTOMER_ID")
    assert _summary(report, "CUS001").status == "PASS"


# ── CUS002: Account Description = Customer Name ────────────────────────────

def test_cus002_pass_and_fail():
    df = pd.DataFrame({
        "CUSTOMER_ID": ["C001", "C002"],
        "CUSTOMER_NAME": ["Acme Corp", "Globex Inc"],
        "ACCOUNT_DESCRIPTION": ["Acme Corp", "Wrong Name"],
    })
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS002"]], "Customer", "CUSTOMER_ID")
    s = _summary(report, "CUS002")
    assert s.pass_count == 1 and s.fail_count == 1
    assert s.status == "FAIL"


# ── CUS003 / CUS004: Bill To / Ship To Required ("Y") ──────────────────────

def test_cus003_and_cus004_pass_fail():
    df = pd.DataFrame({
        "CUSTOMER_ID": ["C001", "C002"],
        "BILL_TO": ["Y", "N"],
        "SHIP_TO": ["Y", "Y"],
    })
    report = BusinessRuleEngine.evaluate(
        df, [CORE_RULES_BY_ID["CUS003"], CORE_RULES_BY_ID["CUS004"]], "Customer", "CUSTOMER_ID"
    )
    assert _summary(report, "CUS003").status == "FAIL"
    assert _summary(report, "CUS003").fail_count == 1
    assert _summary(report, "CUS004").status == "PASS"
    assert _summary(report, "CUS004").fail_count == 0


# ── Missing required columns → core rule NOT_APPLICABLE, never silently passes ──

def test_core_rule_not_applicable_when_field_missing():
    df = pd.DataFrame({"CUSTOMER_ID": ["C001"], "CUSTOMER_NAME": ["Acme"]})
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS001"]], "Customer", "CUSTOMER_ID")
    s = _summary(report, "CUS001")
    assert s.status == "NOT_APPLICABLE"
    assert s.applicable is False
    assert "ADDRESS_LINE_1" in s.message


def test_dynamic_rule_errors_when_field_missing():
    df = pd.DataFrame({"CUSTOMER_ID": ["C001"]})
    dynamic_rule = BusinessRule(
        rule_id="D1", rule_name="Custom Required", entity="Customer",
        field="DOES_NOT_EXIST", rule_type="required", severity="error", is_core=False,
    )
    report = BusinessRuleEngine.evaluate(df, [dynamic_rule], "Customer", "CUSTOMER_ID")
    s = _summary(report, "D1")
    assert s.status == "ERROR"
    assert s.applicable is False


# ── Null/blank values ───────────────────────────────────────────────────────

def test_null_and_blank_values_fail_required_rule():
    df = pd.DataFrame({
        "CUSTOMER_ID": ["C001", "C002", "C003"],
        "CUSTOMER_NAME": ["Acme", None, "   "],
    })
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS005"]], "Customer", "CUSTOMER_ID")
    s = _summary(report, "CUS005")
    assert s.fail_count == 2
    assert s.pass_count == 1


# ── CUS010: Duplicate Customer ID Not Allowed ──────────────────────────────

def test_cus010_duplicate_customer_id():
    df = pd.DataFrame({
        "CUSTOMER_ID": ["C001", "C002", "C001"],
        "CUSTOMER_NAME": ["Acme", "Globex", "Acme Dup"],
    })
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS010"]], "Customer", "CUSTOMER_ID")
    s = _summary(report, "CUS010")
    assert s.status == "FAIL"
    assert s.fail_count == 2  # both rows sharing the duplicated id
    assert s.pass_count == 1


# ── CUS006: primary/business key required & unique ─────────────────────────

def test_cus006_key_required_and_unique():
    df = pd.DataFrame({"CUSTOMER_ID": ["C001", "C001", None]})
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS006"]], "Customer", "CUSTOMER_ID")
    s = _summary(report, "CUS006")
    assert s.status == "FAIL"
    assert s.fail_count == 3  # 2 duplicates + 1 blank


def test_cus006_not_applicable_without_configured_key():
    df = pd.DataFrame({"CUSTOMER_ID": ["C001"]})
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS006"]], "Customer", None)
    s = _summary(report, "CUS006")
    assert s.status == "NOT_APPLICABLE"


# ── Dynamically created rule PASS/FAIL ─────────────────────────────────────

def test_dynamic_rule_pass_and_fail():
    df = pd.DataFrame({
        "CUSTOMER_ID": ["C001", "C002"],
        "COUNTRY": ["US", ""],
    })
    dynamic_rule = BusinessRule(
        rule_id="D2", rule_name="Country Required (custom)", entity="Customer",
        field="COUNTRY", rule_type="required", severity="error", is_core=False,
    )
    report = BusinessRuleEngine.evaluate(df, [dynamic_rule], "Customer", "CUSTOMER_ID")
    s = _summary(report, "D2")
    assert s.pass_count == 1 and s.fail_count == 1
    assert s.status == "FAIL"


# ── Entity-specific rules: a Customer rule doesn't leak into Supplier eval ──

def test_entity_specific_rules_are_scoped():
    df = pd.DataFrame({"SUPPLIER_ID": ["S001"], "ADDRESS_LINE_1": [""]})
    # CUS001 is a Customer rule; evaluating as Supplier should skip it entirely.
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS001"]], "Supplier", "SUPPLIER_ID")
    assert report.rules_evaluated == 0
    assert report.overall_status == "PASS"


def test_get_core_rules_filters_by_entity():
    customer_rules = get_core_rules("Customer")
    assert len(customer_rules) == 10
    assert all(r.entity == "Customer" for r in customer_rules)
    assert get_core_rules("Supplier") == []


# ── Tags/status/reasons format ──────────────────────────────────────────────

def test_result_tag_and_reason_format():
    df = pd.DataFrame({"CUSTOMER_ID": ["C002"], "ADDRESS_LINE_1": [""]})
    report = BusinessRuleEngine.evaluate(df, [CORE_RULES_BY_ID["CUS001"]], "Customer", "CUSTOMER_ID")
    fail = report.results[0]
    assert fail.entity == "Customer"
    assert fail.record_key == "C002"
    assert fail.rule_id == "CUS001"
    assert fail.status == "FAIL"
    assert fail.tag == "ADDRESS_LINE_1_INVALID"
    assert fail.failure_reason is not None


# ── API endpoint tests ───────────────────────────────────────────────────────

def test_api_core_rules_catalog():
    resp = client.get("/api/v1/business-rules/core", params={"entity": "Customer"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["rules"]) == 10
    assert {r["rule_id"] for r in data["rules"]} == {f"CUS{n:03d}" for n in range(1, 11)}


def test_api_validate_end_to_end(tmp_path):
    csv_content = (
        "CUSTOMER_ID,CUSTOMER_NAME,ADDRESS_LINE_1,BILL_TO,SHIP_TO,ACCOUNT_DESCRIPTION\n"
        "C001,Acme Corp,123 Main St,Y,Y,Acme Corp\n"
        "C002,Globex Inc,,N,Y,Globex Inc\n"
    )
    file_name = "biz_rules_test_customers.csv"
    file_path = os.path.join(UPLOAD_DIR, file_name)
    with open(file_path, "w") as f:
        f.write(csv_content)

    try:
        resp = client.post("/api/v1/business-rules/validate", json={
            "file_name": file_name,
            "entity": "Customer",
            "primary_key_column": "CUSTOMER_ID",
            "core_rule_ids": ["CUS001", "CUS003"],
            "dynamic_rules": [],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_status"] == "FAIL"
        cus001 = next(s for s in data["rule_summaries"] if s["rule_id"] == "CUS001")
        assert cus001["fail_count"] == 1
        cus003 = next(s for s in data["rule_summaries"] if s["rule_id"] == "CUS003")
        assert cus003["fail_count"] == 1
    finally:
        os.remove(file_path)


def test_api_validate_missing_file_returns_404():
    resp = client.post("/api/v1/business-rules/validate", json={
        "file_name": "does_not_exist_12345.csv",
        "entity": "Customer",
        "primary_key_column": "CUSTOMER_ID",
        "core_rule_ids": [],
        "dynamic_rules": [],
    })
    assert resp.status_code == 404


def test_api_create_rule_payload_is_persisted_and_executed_alongside_core_rules():
    """
    Regression test for the "Create Rule doesn't actually run" class of bugs:
    sends the exact JSON shape the frontend's RuleModal -> TabRuleResults
    pipeline builds for a freshly created dynamic rule, alongside an enabled
    core rule, and asserts both are evaluated by the same engine pass.
    """
    csv_content = (
        "CUSTOMER_ID,CUSTOMER_NAME,ADDRESS_LINE_1\n"
        "C001,Acme Corp,123 Main St\n"
        "C002,Globex Inc,\n"
    )
    file_name = "e2e_create_rule_regression.csv"
    file_path = os.path.join(UPLOAD_DIR, file_name)
    with open(file_path, "w") as f:
        f.write(csv_content)

    dynamic_rule_from_ui = {
        "rule_id": "abc123",
        "rule_name": "Customer Name must be present",
        "entity": "Customer",
        "field": "CUSTOMER_NAME",
        "target_field": None,
        "rule_type": "required",
        "operator": None,
        "expected_value": None,
        "severity": "error",
        "enabled": True,
        "is_core": False,
        "description": "",
    }

    try:
        resp = client.post("/api/v1/business-rules/validate", json={
            "file_name": file_name,
            "entity": "Customer",
            "primary_key_column": "CUSTOMER_ID",
            "core_rule_ids": ["CUS001"],
            "dynamic_rules": [dynamic_rule_from_ui],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["rules_evaluated"] == 2
        rule_ids = {s["rule_id"] for s in data["rule_summaries"]}
        assert rule_ids == {"CUS001", "abc123"}
        custom_summary = next(s for s in data["rule_summaries"] if s["rule_id"] == "abc123")
        assert custom_summary["status"] == "PASS"
        assert custom_summary["total_evaluated"] == 2
    finally:
        os.remove(file_path)


def test_api_core_catalog_endpoint_is_the_source_the_frontend_registers_on_mount():
    """
    Regression test for the "Core Rules stuck on Loading" bug: the catalog
    endpoint must return all 10 Customer rules with the exact field names
    the frontend's registerCoreRules() reads (rule_id, rule_name, field,
    rule_type, severity, is_core, ...), so auto-registration never silently
    receives an empty or malformed payload.
    """
    resp = client.get("/api/v1/business-rules/core", params={"entity": "Customer"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["rules"]) == 10
    required_keys = {
        "rule_id", "rule_name", "entity", "field", "target_field", "rule_type",
        "operator", "expected_value", "severity", "enabled", "is_core", "description",
    }
    for rule in data["rules"]:
        assert required_keys.issubset(rule.keys())
        assert rule["is_core"] is True
        assert rule["enabled"] is True
