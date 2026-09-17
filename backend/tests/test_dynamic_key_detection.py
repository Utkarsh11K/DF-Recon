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
