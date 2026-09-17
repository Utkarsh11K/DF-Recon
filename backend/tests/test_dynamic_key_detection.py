import os
import sys
import pytest
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.key_detector import KeyDetectionEngine
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

# =============================================================================
# TEST 1 — Exact match
# Source: A, B, C
# FBDI:   A, B, C
# Expected: Common Values = 3, Data Overlap = 100%
# =============================================================================
def test_exact_match():
    df_src = pd.DataFrame({"source_col": ["A", "B", "C"]})
    df_tgt = pd.DataFrame({"fbdi_col": ["A", "B", "C"]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "source_col", "fbdi_col")

    assert pair.common_values == 3
    assert pair.common_value_count == 3
    assert pair.data_overlap == 100.0
    assert pair.value_overlap_ratio == 100.0
    assert pair.nulls_percent == 0.0
    assert pair.unique_percent == 100.0
    assert pair.confidence == 100.0
    assert pair.category == "Strong candidate key"

# =============================================================================
# TEST 2 — Partial overlap
# Source: A, B, C, D
# FBDI:   A, B, C, E
# Expected: Common Values = 3, Data Overlap = 75%
# =============================================================================
def test_partial_overlap():
    df_src = pd.DataFrame({"source_col": ["A", "B", "C", "D"]})
    df_tgt = pd.DataFrame({"fbdi_col": ["A", "B", "C", "E"]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "source_col", "fbdi_col")

    assert pair.common_values == 3
    assert pair.common_value_count == 3
    assert pair.data_overlap == 75.0
    assert pair.nulls_percent == 0.0
    assert pair.unique_percent == 100.0
    # Confidence: 0.50 * 75 + 0.30 * 100 + 0.20 * 100 = 37.5 + 30 + 20 = 87.5%
    assert pair.confidence == 87.5
    assert pair.category == "Strong candidate key"

# =============================================================================
# TEST 3 — Duplicates
# Source: A, A, B, B, C
# FBDI:   A, B, C
# Common Values must be 3, not 5.
# =============================================================================
def test_duplicates():
    df_src = pd.DataFrame({"source_col": ["A", "A", "B", "B", "C"]})
    df_tgt = pd.DataFrame({"fbdi_col": ["A", "B", "C"]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "source_col", "fbdi_col")

    assert pair.common_values == 3
    assert pair.common_value_count == 3
    # Source unique non-null values = 3 (A, B, C)
    # Data Overlap = 3 / 3 * 100 = 100%
    assert pair.data_overlap == 100.0
    # Total rows = 5, Non-null rows = 5, Unique non-null = 3
    # Unique % = 3 / 5 * 100 = 60.0%
    assert pair.unique_percent == 60.0
    assert pair.nulls_percent == 0.0
    # Confidence: 0.50 * 100 + 0.30 * 60.0 + 0.20 * 100 = 50 + 18 + 20 = 88.0%
    assert pair.confidence == 88.0

# =============================================================================
# TEST 4 — Null values
# Source: A, B, "", None, C
# Verify Nulls % and Unique % are calculated correctly.
# Total rows = 5, Null/blank = 2 ("", None), Non-null = 3 (A, B, C), Unique = 3
# Nulls % = 2 / 5 * 100 = 40.0%
# Unique % = 3 / 3 * 100 = 100.0%
# =============================================================================
def test_null_values():
    df_src = pd.DataFrame({"source_col": ["A", "B", "", None, "C"]})
    metrics = KeyDetectionEngine.calculate_column_metrics(df_src["source_col"])

    assert metrics["total_rows"] == 5
    assert metrics["null_count"] == 2
    assert metrics["non_null_count"] == 3
    assert metrics["nulls_percent"] == 40.0
    assert metrics["unique_percent"] == 100.0

# =============================================================================
# TEST 5 — Data Normalization
# Source: " ABC123 ", "abc123"
# FBDI: "ABC123"
# Recognized as same logical value ("abc123")
# =============================================================================
def test_normalization():
    v1 = KeyDetectionEngine.normalize_key_value(" ABC123 ")
    v2 = KeyDetectionEngine.normalize_key_value("abc123")
    v3 = KeyDetectionEngine.normalize_key_value("ABC123")

    assert v1 == "abc123"
    assert v2 == "abc123"
    assert v3 == "abc123"

    df_src = pd.DataFrame({"source_col": [" ABC123 ", "abc123"]})
    df_tgt = pd.DataFrame({"fbdi_col": ["ABC123"]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "source_col", "fbdi_col")
    assert pair.common_values == 1
    assert pair.data_overlap == 100.0

# =============================================================================
# TEST 6 — Confidence Calculation Formula
# Confidence = 50% * Data Overlap + 30% * Source Unique % + 20% * Null Quality
# Where Null Quality = 100 - Nulls %
# =============================================================================
def test_confidence_formula():
    # Source: 10 rows, 2 nulls (Nulls = 20%, Null Quality = 80%), 8 non-null, 8 unique (Unique = 100%)
    # Overlap = 50%
    # Confidence = 0.50 * 50 + 0.30 * 100 + 0.20 * 80 = 25 + 30 + 16 = 71.0%
    src_data = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "", None]
    tgt_data = ["K1", "K2", "K3", "K4", "OTHER1", "OTHER2", "OTHER3", "OTHER4"]

    df_src = pd.DataFrame({"source_col": src_data})
    df_tgt = pd.DataFrame({"fbdi_col": tgt_data})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "source_col", "fbdi_col")

    assert pair.common_values == 4
    assert pair.data_overlap == 50.0
    assert pair.nulls_percent == 20.0
    assert pair.unique_percent == 100.0
    expected_confidence = round(0.50 * 50.0 + 0.30 * 100.0 + 0.20 * 80.0, 2)
    assert pair.confidence == expected_confidence
    assert pair.confidence == 71.0

# =============================================================================
# TEST 7 — Candidate Key Classification
# Strong candidate key, Possible candidate, Weak candidate, Invalid candidate
# =============================================================================
def test_candidate_categories():
    # 1. Strong: Overlap >= 75%, Unique >= 90%, Nulls <= 5%
    df_src = pd.DataFrame({"col": [f"ID_{i}" for i in range(100)]})
    df_tgt = pd.DataFrame({"col": [f"ID_{i}" for i in range(100)]})
    p_strong = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "col", "col")
    assert p_strong.category == "Strong candidate key"

    # 2. Invalid: Overlap = 0%
    df_tgt_zero = pd.DataFrame({"col": [f"DIFF_{i}" for i in range(100)]})
    p_invalid = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt_zero, "col", "col")
    assert p_invalid.category == "Invalid candidate"

# =============================================================================
# TEST 8 — API evaluate-pair Endpoint
# =============================================================================
def test_api_evaluate_pair(tmp_path):
    src_file = tmp_path / "source.csv"
    tgt_file = tmp_path / "fbdi.csv"

    pd.DataFrame({"Customer_ID": ["C1", "C2", "C3"]}).to_csv(src_file, index=False)
    pd.DataFrame({"Customer Number": ["C1", "C2", "C4"]}).to_csv(tgt_file, index=False)

    response = client.post(
        "/api/v1/keys/evaluate-pair",
        json={
            "source_file": str(src_file),
            "target_file": str(tgt_file),
            "source_column": "Customer_ID",
            "target_column": "Customer Number"
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["source_column"] == "Customer_ID"
    assert data["target_column"] == "Customer Number"
    assert data["common_values"] == 2
    assert data["data_overlap"] == 66.67
    assert data["nulls_percent"] == 0.0
    assert data["unique_percent"] == 100.0


# =============================================================================
# MANDATORY STRICT ZERO-NULL CANDIDATE KEY TESTS (Cases 1 - 9)
# =============================================================================

def test_case_1_unique_column_zero_nulls():
    """1. Unique column + 0 nulls -> Strong / valid candidate"""
    df_src = pd.DataFrame({"Customer_Number": [f"CN_{i}" for i in range(50)]})
    df_tgt = pd.DataFrame({"Customer_Number": [f"CN_{i}" for i in range(50)]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "Customer_Number", "Customer_Number")
    assert pair.null_count == 0
    assert pair.null_pct == 0.0
    assert pair.recommendation == "Strong"
    assert pair.category == "Strong candidate key"
    assert pair.reason is None


def test_case_2_unique_column_one_null():
    """2. Unique column + 1 null -> NOT a candidate (Weak, rejected)"""
    vals = [f"CN_{i}" for i in range(49)] + [None]
    df_src = pd.DataFrame({"Customer_Number": vals})
    df_tgt = pd.DataFrame({"Customer_Number": [f"CN_{i}" for i in range(50)]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "Customer_Number", "Customer_Number")
    assert pair.null_count == 1
    assert pair.null_pct == 2.0
    assert pair.recommendation == "Weak"
    assert pair.category == "Weak candidate"
    assert "Rejected as candidate key because it contains 1 null/blank values" in pair.reason


def test_case_3_unique_column_blank_value():
    """3. Unique column + blank value ("", "   ", "nan", "none", "null") -> NOT a candidate"""
    for blank in ["", "   ", "nan", "none", "null", "None", "NaN", "NULL"]:
        vals = [f"ID_{i}" for i in range(19)] + [blank]
        df_src = pd.DataFrame({"Account_ID": vals})
        df_tgt = pd.DataFrame({"Account_ID": [f"ID_{i}" for i in range(20)]})

        pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "Account_ID", "Account_ID")
        assert pair.null_count == 1, f"Failed on blank representation: {repr(blank)}"
        assert pair.recommendation == "Weak"
        assert pair.category == "Weak candidate"
        assert "Rejected as candidate key" in pair.reason


def test_case_4_customer_name_zero_nulls_strong_overlap():
    """4. Customer Name + 0 nulls + strong FBDI overlap -> Strong candidate"""
    names = [f"Company {i}" for i in range(50)]
    df_src = pd.DataFrame({"Customer Name": names})
    df_tgt = pd.DataFrame({"Party Name": names})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "Customer Name", "Party Name")
    assert pair.null_count == 0
    assert pair.null_pct == 0.0
    assert pair.recommendation == "Strong"
    assert pair.category == "Strong candidate key"


def test_case_5_customer_name_nulls_strong_overlap():
    """5. Customer Name + nulls + strong FBDI overlap -> NOT a candidate"""
    names_with_null = [f"Company {i}" for i in range(48)] + [None, ""]
    df_src = pd.DataFrame({"Customer Name": names_with_null})
    df_tgt = pd.DataFrame({"Party Name": [f"Company {i}" for i in range(50)]})

    pair = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, "Customer Name", "Party Name")
    assert pair.null_count == 2
    assert pair.null_pct == 4.0
    assert pair.recommendation == "Weak"
    assert pair.category == "Weak candidate"
    assert "Rejected as candidate key" in pair.reason


def test_case_6_composite_key_all_columns_zero_nulls_unique():
    """6. Composite key with all columns populated and unique -> valid"""
    df_src = pd.DataFrame({
        "Customer Name": [f"Cust_{i % 5}" for i in range(20)],
        "Site Number": [f"Site_{i}" for i in range(20)]
    })
    composites = KeyDetectionEngine.detect_composite_candidates(df_src)
    assert len(composites) > 0
    top = composites[0]
    assert top.null_count == 0
    assert top.null_pct == 0.0
    assert top.recommendation == "Strong"
    assert top.is_composite is True
    assert top.column_names == ["Customer Name", "Site Number"]


def test_case_7_composite_key_one_column_contains_null():
    """7. Composite key where one column contains NULL -> reject"""
    df_src = pd.DataFrame({
        "Customer Name": [f"Cust_{i}" for i in range(20)],
        "Site Number": [f"Site_{i}" for i in range(17)] + [None, "", "nan"]
    })
    # Site Number has 3 nulls, so it must NOT form a candidate
    composites = KeyDetectionEngine.detect_composite_candidates(df_src)
    # No composite candidate can include Site Number
    for c in composites:
        assert "Site Number" not in c.column_names


def test_case_8_manual_key_validation_duplicate_key():
    """8. Duplicate selected key -> is_valid = False"""
    df = pd.DataFrame({
        "Cust_ID": ["C1", "C2", "C3", "C2", "C5"]  # "C2" is duplicated
    })
    result = KeyDetectionEngine.validate_custom_key(df, "Cust_ID")
    assert result["is_valid"] is False
    assert result["duplicate_key_count"] > 0
    assert result["blank_key_count"] == 0
    assert result["validation_checks"]["zero_duplicates"] is False
    assert result["validation_checks"]["zero_nulls"] is True
    assert len(result["duplicate_drilldown"]) == 1
    assert result["duplicate_drilldown"][0]["key"] == "c2"
    assert result["duplicate_drilldown"][0]["count"] == 2


def test_case_9_manual_key_validation_valid_unique_key():
    """9. Valid unique selected key -> is_valid = True"""
    df = pd.DataFrame({
        "Cust_ID": ["C1", "C2", "C3", "C4", "C5"]
    })
    result = KeyDetectionEngine.validate_custom_key(df, "Cust_ID")
    assert result["is_valid"] is True
    assert result["duplicate_key_count"] == 0
    assert result["blank_key_count"] == 0
    assert result["validation_checks"]["zero_duplicates"] is True
    assert result["validation_checks"]["zero_nulls"] is True


def test_single_col_candidates_and_suggested_primary_key(tmp_path):
    """Verify single_col_candidates and suggested_primary_key behavior via full detection"""
    src_file = tmp_path / "source.csv"
    tgt_file = tmp_path / "target.csv"

    # Column with nulls should NEVER be in single_col_candidates or suggested_primary_key
    df_src = pd.DataFrame({
        "Account_ID": [f"A_{i}" for i in range(49)] + [None],  # has null
        "Customer_Number": [f"CN_{i}" for i in range(50)],      # 0 nulls, 100% unique
    })
    df_tgt = pd.DataFrame({
        "ACCOUNT_ID": [f"A_{i}" for i in range(50)],
        "ACCOUNT_NUMBER": [f"CN_{i}" for i in range(50)],
    })
    df_src.to_csv(src_file, index=False)
    df_tgt.to_csv(tgt_file, index=False)

    resp = KeyDetectionEngine.detect_candidate_keys_full(str(src_file), str(tgt_file), top_n=5)

    # Account_ID has 1 null -> must NOT be in single_col_candidates
    single_sources = [c.source_column for c in resp.single_col_candidates]
    assert "Account_ID" not in single_sources
    assert "Customer_Number" in single_sources

    # suggested_primary_key must be Customer_Number
    assert resp.suggested_primary_key == ["Customer_Number"]


def test_api_detect_keys_endpoints(tmp_path):
    """Verify POST /api/v1/keys/detect endpoint integration with strict zero nulls rule"""
    src_file = tmp_path / "source.csv"
    tgt_file = tmp_path / "target.csv"

    df_src = pd.DataFrame({
        "Has_Nulls_ID": [f"N_{i}" for i in range(19)] + [None],
        "Clean_Key_ID": [f"K_{i}" for i in range(20)],
    })
    df_tgt = pd.DataFrame({
        "FBDI_NULLS": [f"N_{i}" for i in range(20)],
        "FBDI_CLEAN": [f"K_{i}" for i in range(20)],
    })
    df_src.to_csv(src_file, index=False)
    df_tgt.to_csv(tgt_file, index=False)

    response = client.post(
        "/api/v1/keys/detect",
        json={
            "source_file": str(src_file),
            "target_file": str(tgt_file),
            "top_n": 5
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "single_col_candidates" in data
    assert "suggested_primary_key" in data

    # Null column must NOT be suggested primary key
    assert data["suggested_primary_key"] == ["Clean_Key_ID"]

    # All items in single_col_candidates must have 0 nulls
    for cand in data["single_col_candidates"]:
        assert cand["source_column"] != "Has_Nulls_ID"
        assert cand["null_count"] == 0
        assert cand["null_pct"] == 0.0


def test_api_validate_custom_key_endpoint(tmp_path):
    """Verify POST /api/v1/keys/validate-custom-key endpoint integration"""
    file_path = tmp_path / "sample.csv"
    pd.DataFrame({
        "VALID_ID": ["A", "B", "C"],
        "DUP_ID": ["A", "A", "C"],
        "NULL_ID": ["A", None, "C"]
    }).to_csv(file_path, index=False)

    # Valid key
    res_valid = client.post("/api/v1/keys/validate-custom-key", json={"source_file": str(file_path), "key_columns": ["VALID_ID"]})
    assert res_valid.status_code == 200
    assert res_valid.json()["is_valid"] is True

    # Duplicate key
    res_dup = client.post("/api/v1/keys/validate-custom-key", json={"source_file": str(file_path), "key_columns": ["DUP_ID"]})
    assert res_dup.status_code == 200
    assert res_dup.json()["is_valid"] is False

    # Null key
    res_null = client.post("/api/v1/keys/validate-custom-key", json={"source_file": str(file_path), "key_columns": ["NULL_ID"]})
    assert res_null.status_code == 200
    assert res_null.json()["is_valid"] is False


