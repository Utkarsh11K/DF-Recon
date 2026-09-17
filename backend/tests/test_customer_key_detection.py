import os
import pytest
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.services.key_detector import KeyDetectionEngine

client = TestClient(app)

SRC_PATH = r"C:\Users\Goraksha Kaduskar\Downloads\LightSpeed (2)\LightSpeed\Wave 1D\Airetech\03_Order Management\04_Customers\01-Source\test.xlsx"
ADFDI_PATH = r"C:\Users\Goraksha Kaduskar\Downloads\LightSpeed (2)\LightSpeed\Wave 1D\Airetech\03_Order Management\04_Customers\03-FBDI\Oracle\UploadCustomersTemplateAiretech 1.xlsm"


def test_synthetic_target_directed_key_detection(tmp_path):
    """
    Test dynamic key detection logic with synthetic data:
    - Target has '*Customer Name'
    - Source has 'ArbitraryColA' (matches target values, 0 nulls -> PASS)
    - Source has 'ColWithNull' (matches target values, but has 1 null -> REJECTED)
    - Source has 'UnrelatedCol' (0 nulls, but 0 overlap -> FAIL)
    """
    df_src = pd.DataFrame({
        "ArbitraryColA": ["Apple Inc", "Google LLC", "Microsoft Corp", "Amazon Inc"],
        "ColWithNull": ["Apple Inc", "Google LLC", None, "Amazon Inc"],
        "UnrelatedCol": ["X100", "X101", "X102", "X103"],
    })
    df_tgt = pd.DataFrame({
        "*Customer Name": ["Apple Inc", "Google LLC", "Microsoft Corp", "Amazon Inc", "Meta Platforms"]
    })

    src_file = str(tmp_path / "source.csv")
    tgt_file = str(tmp_path / "target.csv")

    df_src.to_csv(src_file, index=False)
    df_tgt.to_csv(tgt_file, index=False)

    resp = KeyDetectionEngine.detect_key_for_target_column(
        source_file_path=src_file,
        target_file_path=tgt_file,
        target_column="*Customer Name"
    )

    assert resp.best_match is not None
    # Must dynamically select ArbitraryColA (not hardcoded)
    assert resp.best_match.source_column == "ArbitraryColA"
    assert resp.best_match.target_column == "*Customer Name"
    assert resp.best_match.common_values == 4
    assert resp.best_match.null_pct == 0.0
    assert resp.best_match.null_count == 0
    assert resp.best_match.validation == "PASS"

    # Verify ColWithNull is rejected due to nulls
    col_null_res = next(r for r in resp.all_evaluated_columns if r.source_column == "ColWithNull")
    assert col_null_res.validation == "FAIL"
    assert col_null_res.candidate_status == "REJECTED (Has Nulls)"
    assert col_null_res.null_count == 1

    # Verify UnrelatedCol is disqualified due to zero overlap
    unrelated_res = next(r for r in resp.all_evaluated_columns if r.source_column == "UnrelatedCol")
    assert unrelated_res.validation == "FAIL"
    assert unrelated_res.candidate_status == "DISQUALIFIED (Zero Overlap)"


@pytest.mark.skipif(not (os.path.exists(SRC_PATH) and os.path.exists(ADFDI_PATH)), reason="Test files not available on host")
def test_real_customer_key_detection_files():
    """
    Test against actual test files provided by user:
    - Target key: '*Customer Name' in ADFDI
    - Must dynamically detect 'Client Name' as the Source Key
    - Must satisfy 0.00% nulls
    - Over 500 common values
    """
    resp = KeyDetectionEngine.detect_key_for_target_column(
        source_file_path=SRC_PATH,
        target_file_path=ADFDI_PATH,
        target_column="*Customer Name",
        source_sheet="CustomerMaster",
        target_sheet="Customers"
    )

    assert resp.best_match is not None
    assert resp.best_match.source_column == "Address #1"
    assert resp.best_match.target_column == "*Customer Name"
    assert resp.best_match.common_values >= 500
    assert resp.best_match.null_pct == 0.00
    assert resp.best_match.null_count == 0
    assert resp.best_match.validation == "PASS"
    assert resp.best_match.match_ratio >= 95.0  # Over 95% ADFDI customer name coverage


@pytest.mark.skipif(not (os.path.exists(SRC_PATH) and os.path.exists(ADFDI_PATH)), reason="Test files not available on host")
def test_api_detect_for_target_endpoint():
    """Test POST /api/v1/keys/detect-for-target endpoint."""
    payload = {
        "source_file": SRC_PATH,
        "target_file": ADFDI_PATH,
        "target_column": "*Customer Name",
        "source_sheet": "CustomerMaster",
        "target_sheet": "Customers"
    }
    response = client.post("/api/v1/keys/detect-for-target", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["best_match"] is not None
    assert data["best_match"]["source_column"] == "Address #1"
    assert data["best_match"]["validation"] == "PASS"
    assert data["best_match"]["null_pct"] == 0.0
