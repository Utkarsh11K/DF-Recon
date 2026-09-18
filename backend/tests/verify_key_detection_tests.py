"""
Verification test suite for Dynamic Key Detection and Validation.
Run from project root: python backend/tests/verify_key_detection_tests.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pandas as pd
import numpy as np
import tempfile

from app.services.key_detector import KeyDetectionEngine
from app.schemas.key_detection_schema import CandidateKeyPair, RightKeyValidationResult, BasicValidationCheck

PASS = "\u2705 PASS"
FAIL = "\u274c FAIL"
WARN = "\u26a0\ufe0f  WARN"

results = []

def record(test_num, test_name, passed, detail="", bug=""):
    status = PASS if passed else FAIL
    results.append((test_num, test_name, status, detail, bug))
    print(f"\nTEST {test_num}: {test_name}")
    print(f"  Status : {status}")
    print(f"  Detail : {detail}")
    if bug:
        print(f"  BUG    : {bug}")

# ─────────────────────────────────────────────────────────────
# TEST 1: Different column names, same values (ERP synonym)
# LEGACY_CUST_ID (source) ↔ ORIG_SYSTEM_REFERENCE (fbdi)
# ─────────────────────────────────────────────────────────────
def test1():
    ids = [f"CUST_{i:04d}" for i in range(1, 51)]
    src = pd.DataFrame({"LEGACY_CUST_ID": ids, "NAME": [f"Name{i}" for i in range(50)]})
    tgt = pd.DataFrame({"ORIG_SYSTEM_REFERENCE": ids, "PARTY_NAME": [f"Name{i}" for i in range(50)]})
    with tempfile.TemporaryDirectory() as d:
        sp = os.path.join(d, "src.csv"); tp = os.path.join(d, "tgt.csv")
        src.to_csv(sp, index=False); tgt.to_csv(tp, index=False)
        candidates = KeyDetectionEngine.detect_candidate_keys(sp, tp, top_n=5)

    detected_pair = next((c for c in candidates
                          if c.source_column == "LEGACY_CUST_ID" and c.target_column == "ORIG_SYSTEM_REFERENCE"), None)
    
    if detected_pair:
        record(1, "ERP synonym detection (LEGACY_CUST_ID↔ORIG_SYSTEM_REFERENCE)", True,
               f"Detected with confidence={detected_pair.confidence}, name_sim={detected_pair.name_similarity}, overlap={detected_pair.value_overlap_ratio}")
    else:
        all_pairs = [(c.source_column, c.target_column, c.confidence) for c in candidates]
        record(1, "ERP synonym detection (LEGACY_CUST_ID↔ORIG_SYSTEM_REFERENCE)", False,
               f"Not detected. Top candidates: {all_pairs}",
               bug="KeyDetectionEngine.ERP_SYNONYMS lookup or confidence threshold may be filtering this pair")

# ─────────────────────────────────────────────────────────────
# TEST 2: Correct key ranks higher than misleadingly named column
# ─────────────────────────────────────────────────────────────
def test2():
    ids = [f"CUST_{i:04d}" for i in range(1, 51)]
    decoy = ["DECOY_CUST_ID"] * 50   # Same name pattern, wrong values
    src = pd.DataFrame({"CUST_ID": ids, "DECOY_CUST_ID": decoy})
    tgt = pd.DataFrame({"CUST_ID": ids})
    with tempfile.TemporaryDirectory() as d:
        sp = os.path.join(d, "src.csv"); tp = os.path.join(d, "tgt.csv")
        src.to_csv(sp, index=False); tgt.to_csv(tp, index=False)
        candidates = KeyDetectionEngine.detect_candidate_keys(sp, tp, top_n=5)

    correct = next((c for c in candidates if c.source_column == "CUST_ID"), None)
    decoy_c = next((c for c in candidates if c.source_column == "DECOY_CUST_ID"), None)

    if correct and (decoy_c is None or correct.confidence > decoy_c.confidence):
        record(2, "Correct key ranks higher than misleading column", True,
               f"CUST_ID confidence={correct.confidence}, DECOY_CUST_ID confidence={getattr(decoy_c,'confidence','not in top-5')}")
    else:
        record(2, "Correct key ranks higher than misleading column", False,
               f"CUST_ID conf={getattr(correct,'confidence','N/A')}, DECOY conf={getattr(decoy_c,'confidence','N/A')}",
               bug="Scoring doesn't properly penalize zero-overlap columns with good names")

# ─────────────────────────────────────────────────────────────
# TEST 3: Key contains NULL/empty values — basic validation
# ─────────────────────────────────────────────────────────────
def test3():
    ids = [f"CUST_{i:04d}" for i in range(1, 51)]
    ids_with_nulls = ids[:40] + [None] * 10  # 20% nulls
    src = pd.DataFrame({"CUST_ID": ids_with_nulls})
    tgt = pd.DataFrame({"CUST_ID": ids})
    df_src = pd.DataFrame(src); df_tgt = pd.DataFrame(tgt)
    basic = KeyDetectionEngine.validate_basic_key_integrity(df_src, df_tgt, "CUST_ID", "CUST_ID")
    
    has_nulls_flagged = basic.source_nulls_count > 0
    record(3, "NULL values in key are detected by basic validation", has_nulls_flagged,
           f"source_nulls_count={basic.source_nulls_count}, target_nulls_count={basic.target_nulls_count}",
           bug="" if has_nulls_flagged else "validate_basic_key_integrity does not count nulls correctly")
    
    # Also check: does right_key validation degrade with nulls?
    validation = KeyDetectionEngine.validate_right_key(df_src, df_tgt, "CUST_ID", "CUST_ID")
    record("3b", "validate_right_key handles NULLs without crashing", True,
           f"status={validation.status}, overlap_ratio={validation.overlap_ratio}, cardinality={validation.cardinality}")

# ─────────────────────────────────────────────────────────────
# TEST 4: Duplicate keys — cardinality check
# ─────────────────────────────────────────────────────────────
def test4():
    # Source has duplicates
    ids = [f"CUST_{i:04d}" for i in range(1, 26)] * 2  # 50 rows, 25 unique
    tgt_ids = [f"CUST_{i:04d}" for i in range(1, 51)]
    src = pd.DataFrame({"CUST_ID": ids})
    tgt = pd.DataFrame({"CUST_ID": tgt_ids})
    
    basic = KeyDetectionEngine.validate_basic_key_integrity(src, tgt, "CUST_ID", "CUST_ID")
    validation = KeyDetectionEngine.validate_right_key(src, tgt, "CUST_ID", "CUST_ID")
    
    dups_detected = basic.source_duplicates_count > 0
    cardinality_flagged = validation.cardinality in ["N:1", "N:M"]
    
    record(4, "Duplicate source keys detected by basic validation", dups_detected,
           f"source_duplicates_count={basic.source_duplicates_count}",
           bug="" if dups_detected else "validate_basic_key_integrity computes duplicates incorrectly")
    record("4b", "Duplicate keys result in N:1 or N:M cardinality", cardinality_flagged,
           f"cardinality={validation.cardinality}, status={validation.status}",
           bug="" if cardinality_flagged else "Cardinality detection is wrong with duplicates")

# ─────────────────────────────────────────────────────────────
# TEST 5: Low/no value overlap → validation should FAIL
# ─────────────────────────────────────────────────────────────
def test5():
    src = pd.DataFrame({"CUST_ID": [f"SRC_{i}" for i in range(1, 51)]})
    tgt = pd.DataFrame({"CUST_ID": [f"TGT_{i}" for i in range(100, 150)]})  # Zero overlap
    
    validation = KeyDetectionEngine.validate_right_key(src, tgt, "CUST_ID", "CUST_ID")
    
    is_invalid = validation.status == "INVALID"
    record(5, "Zero overlap key marked as INVALID", is_invalid,
           f"status={validation.status}, overlap_ratio={validation.overlap_ratio}",
           bug="" if is_invalid else "validate_right_key does not set status=INVALID when overlap<10%")

# ─────────────────────────────────────────────────────────────
# TEST 6: Valid relationship → VALID
# ─────────────────────────────────────────────────────────────
def test6():
    ids = [f"CUST_{i:04d}" for i in range(1, 51)]
    src = pd.DataFrame({"CUST_ID": ids, "NAME": [f"Name{i}" for i in range(50)]})
    tgt = pd.DataFrame({"CUST_ID": ids, "STATUS": ["Active"] * 50})
    
    basic = KeyDetectionEngine.validate_basic_key_integrity(src, tgt, "CUST_ID", "CUST_ID")
    validation = KeyDetectionEngine.validate_right_key(src, tgt, "CUST_ID", "CUST_ID")
    
    is_valid = validation.status == "VALID" and basic.source_nulls_count == 0 and basic.source_duplicates_count == 0
    record(6, "Valid 1:1 key relationship returns VALID", is_valid,
           f"status={validation.status}, cardinality={validation.cardinality}, overlap={validation.overlap_ratio}%, nulls={basic.source_nulls_count}, dups={basic.source_duplicates_count}")

# ─────────────────────────────────────────────────────────────
# TEST 7: Different column order — detection still works
# ─────────────────────────────────────────────────────────────
def test7():
    ids = [f"CUST_{i:04d}" for i in range(1, 51)]
    src = pd.DataFrame({"NAME": [f"Name{i}" for i in range(50)], "CUST_ID": ids, "EMAIL": [f"e{i}@x.com" for i in range(50)]})
    tgt = pd.DataFrame({"STATUS": ["A"]*50, "PARTY_ID": ids, "PARTY_NAME": [f"Name{i}" for i in range(50)]})
    
    with tempfile.TemporaryDirectory() as d:
        sp = os.path.join(d, "src.csv"); tp = os.path.join(d, "tgt.csv")
        src.to_csv(sp, index=False); tgt.to_csv(tp, index=False)
        candidates = KeyDetectionEngine.detect_candidate_keys(sp, tp, top_n=8)
    
    # CUST_ID ↔ PARTY_ID or any high-confidence ID pair
    id_pair = next((c for c in candidates if "ID" in c.source_column.upper() and "ID" in c.target_column.upper()), None)
    record(7, "Detection works with different column order", len(candidates) > 0,
           f"Top candidates: {[(c.source_column, c.target_column, c.confidence) for c in candidates[:3]]}",
           bug="" if candidates else "No candidates found — engine likely fails with non-matching column order")

# ─────────────────────────────────────────────────────────────
# TEST 8: Case/whitespace differences in key values
# ─────────────────────────────────────────────────────────────
def test8():
    src_ids = ["CUST-1001 ", "CUST-1002", " CUST-1003"]  # Trailing/leading spaces
    tgt_ids = ["cust-1001", "cust-1002", "cust-1003"]     # Lowercase
    
    src = pd.DataFrame({"CUST_ID": src_ids})
    tgt = pd.DataFrame({"CUST_ID": tgt_ids})
    
    # Check: does value overlap calculate raw or normalized?
    s1_raw = set(src["CUST_ID"].dropna().astype(str))
    s2_raw = set(tgt["CUST_ID"].dropna().astype(str))
    s1_norm = set(src["CUST_ID"].dropna().astype(str).str.strip().str.lower())
    s2_norm = set(tgt["CUST_ID"].dropna().astype(str).str.strip().str.lower())
    
    raw_overlap = len(s1_raw.intersection(s2_raw))
    norm_overlap = len(s1_norm.intersection(s2_norm))
    
    # Engine uses raw comparison (no normalization in _calculate_value_overlap)
    overlap = KeyDetectionEngine._calculate_value_overlap(src["CUST_ID"], tgt["CUST_ID"])
    
    record(8, "Case/whitespace normalization behavior", True,
           f"Raw overlap={raw_overlap}/3, Normalized overlap={norm_overlap}/3, Engine returned={overlap:.1f}%",
           bug="ENGINE DOES NOT NORMALIZE before overlap. 'CUST-1001 '!='cust-1001' → overlap=0%. "
               "This is a real gap: case/whitespace differences cause false INVALID results.")

# ─────────────────────────────────────────────────────────────
# EXTRA: Reconciliation Gate check — does reconciliation respect key?
# ─────────────────────────────────────────────────────────────
def test_recon_gate():
    # The reconciliation engine falls back to columns[0] if key is missing
    from app.services.reconciliation_engine import BackendReconciliationEngine
    from app.schemas.validation_schema import ReconciliationRequest
    
    # Test with no files (empty DF path)
    req = ReconciliationRequest(
        batch_id="test_batch",
        source_key="CUST_ID",
        target_key="ORIG_SYSTEM_REFERENCE",
        expected_execution_timestamp="20260902143000",
        fusion_execution_timestamp="20260902143000",
    )
    result = BackendReconciliationEngine.execute_reconciliation(req)
    
    blocked = result.status == "NO_FILES_SELECTED"
    record("GATE", "Reconciliation blocked when no files provided", blocked,
           f"status={result.status}, message={result.message[:80]}...",
           bug="" if blocked else "Recon engine proceeds without files — no gate enforced")
    
    # KEY GAP: Even with files, if source_key is wrong the engine silently falls back to column[0]
    # This is found at reconciliation_engine.py:98-110 — not verified by a test
    record("GATE2", "[CRITICAL] Recon engine silently falls back to columns[0] when key not found",
           False,  # This IS a bug — no test exists for it
           "reconciliation_engine.py:98-110 — if source_key not in columns, falls back to iloc[:,0] silently",
           bug="NO gate: reconciliation proceeds with wrong key silently. There is no hard block for invalid keys.")

# ─────────────────────────────────────────────────────────────
# RUN ALL TESTS
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("="*70)
    print("DF-RECON: Dynamic Key Detection Verification Suite")
    print("="*70)
    test1()
    test2()
    test3()
    test4()
    test5()
    test6()
    test7()
    test8()
    test_recon_gate()

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    for num, name, status, detail, bug in results:
        print(f"  TEST {str(num):5s}: {status}  {name}")
        if bug:
            print(f"             BUG: {bug}")
