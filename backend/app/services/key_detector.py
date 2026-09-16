"""
DF-Recon Key Detection Engine
=============================================================
Detects primary keys by comparing SOURCE file vs FBDI/HDL target file.

Pipeline:
  1. Load both files (CSV, Excel/XLSX multi-sheet, DAT)
  2. Detect FBDI entity type (Customer, Supplier, Employee, GL, Invoice)
  3. Auto-assign Oracle FBDI known primary key columns by entity
  4. Extract unique values from detected FBDI key columns
  5. Analyze each SOURCE column: null %, unique %, value overlap vs FBDI
  6. Rank candidates: Strong / Possible / Weak with detailed reasons
  7. Return top 15 candidates + best suggested key
"""

import os
import io
import pandas as pd
from typing import List, Dict, Any, Optional, Set, Tuple
from dataclasses import dataclass, field


# Oracle FBDI / HDL Entity -> Primary Key Column Map
ORACLE_ENTITY_KEY_MAP: Dict[str, Dict[str, Any]] = {
    "customer": {
        "label": "Customer (AR)",
        "fbdi_keys": ["OrigSystemReference", "CustomerNumber", "PartyNumber", "AccountNumber"],
        "keywords": [
            "customer", "cust", "party", "account", "client", "ar_",
            "receivable", "account_number", "account_name", "cust_name"
        ],
    },
    "supplier": {
        "label": "Supplier / Vendor (AP)",
        "fbdi_keys": ["Segment1", "VendorNumber", "SupplierSiteCode", "VendorName"],
        "keywords": [
            "supplier", "vendor", "ap_", "payable", "segment1",
            "vendor_name", "supplier_name", "vendor_num"
        ],
    },
    "employee": {
        "label": "Employee (HCM)",
        "fbdi_keys": ["EmployeeNumber", "PersonNumber", "AssignmentNumber", "WorkerNumber"],
        "keywords": [
            "employee", "emp_", "person", "worker", "hcm", "assignment",
            "staff", "hr_", "person_number"
        ],
    },
    "gl": {
        "label": "GL Account / Ledger",
        "fbdi_keys": ["Segment1", "Segment2", "Segment3", "CodeCombinationId"],
        "keywords": [
            "segment", "gl_", "ledger", "account_code", "code_combination",
            "natural_account", "cost_center"
        ],
    },
    "invoice": {
        "label": "AR Invoice / Transaction",
        "fbdi_keys": ["TrxNumber", "TransactionSource", "BatchSourceName", "InvoiceNumber"],
        "keywords": [
            "invoice", "trx_", "transaction", "invoice_num", "trx_number",
            "invoice_number", "receipt"
        ],
    },
    "asset": {
        "label": "Fixed Asset (FA)",
        "fbdi_keys": ["AssetNumber", "TagNumber", "AssetId"],
        "keywords": ["asset", "fa_", "fixed_asset", "asset_num", "tag_number"],
    },
    "bank": {
        "label": "Bank / Cash Management",
        "fbdi_keys": ["BankAccountNum", "IBANNumber", "BankBranchName"],
        "keywords": ["bank", "cash", "iban", "bank_account", "branch"],
    },
}

NON_KEY_COLUMN_KEYWORDS = {
    "address", "street", "city", "state", "province", "country", "region",
    "zip", "postal", "description", "notes", "comments", "remarks",
    "status", "type", "category", "group", "label", "flag", "indicator",
    "amount", "price", "cost", "total", "sum", "tax", "currency", "rate",
    "percent", "date", "time", "timestamp", "created_at", "updated_at",
    "opco", "index", "idx", "sequence", "row_num",
}

HIGH_PRIORITY_KEY_KEYWORDS = {
    "customer_number", "cust_number", "cust_num", "account_number", "account_num",
    "party_number", "party_num", "customer_name", "cust_name", "party_name",
    "vendor_number", "vendor_num", "supplier_number", "employee_number",
    "person_number", "trx_number", "invoice_number",
}

MEDIUM_PRIORITY_KEY_KEYWORDS = {"id", "code", "key", "ref", "pk", "num", "number", "reference"}


@dataclass
class FBDIKeyInfo:
    role: str
    col_name: str
    unique_count: int
    values: Set[str]


@dataclass
class KeyCandidate:
    column_name: str
    uniqueness_pct: float
    null_pct: float
    recommendation: str
    reason: str
    fbdi_overlap_pct: float
    fbdi_matched_col: Optional[str]
    fbdi_matched_role: Optional[str]
    sample_values: List[str]
    is_composite: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "column_name": self.column_name,
            "uniqueness_pct": round(self.uniqueness_pct, 2),
            "null_pct": round(self.null_pct, 2),
            "recommendation": self.recommendation,
            "reason": self.reason,
            "fbdi_overlap_pct": round(self.fbdi_overlap_pct, 2),
            "fbdi_matched_col": self.fbdi_matched_col,
            "fbdi_matched_role": self.fbdi_matched_role,
            "sample_values": self.sample_values[:5],
            "is_composite": self.is_composite,
        }


@dataclass
class KeyDetectionResult:
    status: str
    entity_type: Optional[str]
    entity_label: Optional[str]
    suggested_source_key: Optional[str]
    suggested_fbdi_key: Optional[str]
    candidates: List[KeyCandidate]
    fbdi_keys_found: List[Dict[str, Any]]
    analysis_summary: Dict[str, Any]
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "entity_type": self.entity_type,
            "entity_label": self.entity_label,
            "suggested_source_key": self.suggested_source_key,
            "suggested_fbdi_key": self.suggested_fbdi_key,
            "candidates": [c.to_dict() for c in self.candidates],
            "fbdi_keys_found": self.fbdi_keys_found,
            "analysis_summary": self.analysis_summary,
            "errors": self.errors,
        }


def _load_file(file_source: Any, file_name: str) -> pd.DataFrame:
    ext = os.path.splitext(file_name)[1].lower()
    try:
        if ext in (".xlsx", ".xls", ".xlsm"):
            if isinstance(file_source, (bytes, bytearray)):
                file_source = io.BytesIO(file_source)
            engine = "openpyxl" if ext in (".xlsx", ".xlsm") else "xlrd"
            xl = pd.ExcelFile(file_source, engine=engine)
            best_df = pd.DataFrame()
            best_score = -1
            for sname in xl.sheet_names:
                try:
                    df_s = pd.read_excel(xl, sheet_name=sname)
                    score = len(df_s) * max(1, len(df_s.columns))
                    if score > best_score:
                        best_score = score
                        best_df = df_s
                        best_sheet = sname
                except Exception:
                    continue
            if best_df.empty:
                return pd.DataFrame()
            best_df.columns = [str(c).strip() for c in best_df.columns]
            return best_df.dropna(how="all").reset_index(drop=True)
        elif ext in (".csv", ".txt", ".dat"):
            content = b""
            if isinstance(file_source, (bytes, bytearray)):
                content = file_source
            elif isinstance(file_source, str) and os.path.exists(file_source):
                with open(file_source, "rb") as f:
                    content = f.read()
            text_sample = content[:2000].decode("utf-8", errors="replace")
            delimiter = ","
            for d in ["\t", "|", ";"]:
                if text_sample.count(d) > text_sample.count(delimiter):
                    delimiter = d
            return pd.read_csv(io.BytesIO(content), sep=delimiter, encoding="utf-8",
                               errors="replace", low_memory=False)
    except Exception as e:
        raise ValueError(f"Could not load '{file_name}': {e}")
    return pd.DataFrame()


def _detect_entity(columns: List[str], file_name: str = "") -> Optional[str]:
    text = (file_name + " " + " ".join(columns)).lower()
    scores: Dict[str, int] = {}
    for entity, info in ORACLE_ENTITY_KEY_MAP.items():
        score = 0
        for kw in info["keywords"]:
            if kw in text:
                score += 2 if kw in file_name.lower() else 1
        for fk in info["fbdi_keys"]:
            if any(fk.lower() == c.lower() for c in columns):
                score += 5
        if score > 0:
            scores[entity] = score
    if not scores:
        return None
    return max(scores, key=scores.get)


def _analyze_column(series: pd.Series, total_rows: int) -> Tuple[float, float, Set[str], List[str]]:
    null_count = int(series.isna().sum())
    null_pct = (null_count / total_rows * 100) if total_rows > 0 else 0.0
    non_null = series.dropna().astype(str).str.strip()
    non_blank = non_null[~non_null.isin(["", "nan", "None", "NULL", "null", "NaN"])]
    unique_vals: Set[str] = set(non_blank)
    unique_pct = (len(unique_vals) / total_rows * 100) if total_rows > 0 else 0.0
    sample = list(non_blank.head(8))
    return null_pct, unique_pct, unique_vals, sample


def _col_priority(col_name: str) -> int:
    lower = col_name.strip().lower()
    if any(kw in lower for kw in NON_KEY_COLUMN_KEYWORDS):
        return 99
    if any(kw in lower for kw in HIGH_PRIORITY_KEY_KEYWORDS):
        return 0
    if any(kw in lower for kw in MEDIUM_PRIORITY_KEY_KEYWORDS):
        return 10
    return 50


def _overlap_pct(source_vals: Set[str], fbdi_vals: Set[str]) -> float:
    if not fbdi_vals:
        return 0.0
    common = source_vals.intersection(fbdi_vals)
    return round(len(common) / len(fbdi_vals) * 100, 2)


def _recommend(col_name, unique_pct, null_pct, priority, best_overlap, best_fbdi_col):
    if priority == 99:
        return "Weak", f"✗ Non-key attribute column"
    if priority == 0 and best_overlap >= 50:
        return "Strong", f"✓ Known business key with {best_overlap:.1f}% FBDI overlap against '{best_fbdi_col}' ({unique_pct:.1f}% unique, {null_pct:.1f}% null)"
    if best_overlap >= 80:
        return "Strong", f"✓ {best_overlap:.1f}% values match FBDI '{best_fbdi_col}' — confirmed identity column ({unique_pct:.1f}% unique)"
    if unique_pct >= 99 and null_pct == 0:
        return "Strong", f"✓ Perfect: 100% unique, 0% null — ideal primary key"
    if best_overlap >= 50:
        return "Strong", f"✓ {best_overlap:.1f}% overlap with FBDI '{best_fbdi_col}', {unique_pct:.1f}% unique"
    if priority == 0 and unique_pct >= 90:
        return "Possible", f"~ Business key column pattern ({unique_pct:.1f}% unique, {best_overlap:.1f}% FBDI overlap)"
    if best_overlap >= 20:
        return "Possible", f"~ Partial FBDI overlap ({best_overlap:.1f}%) against '{best_fbdi_col}' — may be reformatted key"
    if unique_pct >= 95 and null_pct <= 5:
        return "Possible", f"~ High uniqueness ({unique_pct:.1f}%) — possible natural key, no FBDI match found"
    if unique_pct < 80:
        return "Weak", f"✗ Low uniqueness ({unique_pct:.1f}%) — too many duplicates"
    if null_pct > 10:
        return "Weak", f"✗ High null rate ({null_pct:.1f}%)"
    return "Weak", f"✗ No FBDI overlap, insufficient key characteristics"


class KeyDetectionEngine:

    def detect(self, source_content, source_name, fbdi_content, fbdi_name, max_candidates=15):
        errors = []
        try:
            source_df = _load_file(source_content, source_name)
            fbdi_df = _load_file(fbdi_content, fbdi_name)
            source_rows, fbdi_rows = len(source_df), len(fbdi_df)

            if source_rows == 0:
                raise ValueError("Source file has 0 data rows.")
            if fbdi_rows == 0:
                raise ValueError("FBDI file has 0 data rows.")

            source_cols = [str(c).strip() for c in source_df.columns]
            fbdi_cols = [str(c).strip() for c in fbdi_df.columns]

            entity_type = _detect_entity(fbdi_cols, fbdi_name)
            entity_info = ORACLE_ENTITY_KEY_MAP.get(entity_type, {}) if entity_type else {}
            entity_label = entity_info.get("label", "Unknown Entity")

            fbdi_keys_found = []
            oracle_key_cols = entity_info.get("fbdi_keys", [])

            for fk_col in oracle_key_cols:
                matched_col = next(
                    (c for c in fbdi_cols if c == fk_col),
                    next((c for c in fbdi_cols if c.lower() == fk_col.lower()), None)
                )
                if matched_col and matched_col in fbdi_df.columns:
                    _, _, fbdi_vals, _ = _analyze_column(fbdi_df[matched_col], fbdi_rows)
                    if fbdi_vals:
                        fbdi_keys_found.append(FBDIKeyInfo(
                            role=fk_col, col_name=matched_col,
                            unique_count=len(fbdi_vals), values=fbdi_vals
                        ))

            if not fbdi_keys_found:
                for col in fbdi_cols:
                    if _col_priority(col) < 20:
                        _, _, fbdi_vals, _ = _analyze_column(fbdi_df[col], fbdi_rows)
                        if fbdi_vals:
                            fbdi_keys_found.append(FBDIKeyInfo(
                                role=col, col_name=col,
                                unique_count=len(fbdi_vals), values=fbdi_vals
                            ))
                if not fbdi_keys_found:
                    errors.append("No business key columns found in FBDI. Using name-pattern only.")

            candidates_raw = []
            for col in source_cols:
                priority = _col_priority(col)
                if priority == 99:
                    continue
                null_pct, unique_pct, src_vals, sample = _analyze_column(source_df[col], source_rows)

                best_overlap, best_fbdi_col, best_fbdi_role = 0.0, None, None
                for fk in fbdi_keys_found:
                    ov = _overlap_pct(src_vals, fk.values)
                    if ov > best_overlap:
                        best_overlap, best_fbdi_col, best_fbdi_role = ov, fk.col_name, fk.role

                recommendation, reason = _recommend(col, unique_pct, null_pct, priority, best_overlap, best_fbdi_col)

                candidates_raw.append({
                    "candidate": KeyCandidate(
                        column_name=col, uniqueness_pct=unique_pct, null_pct=null_pct,
                        recommendation=recommendation, reason=reason,
                        fbdi_overlap_pct=best_overlap, fbdi_matched_col=best_fbdi_col,
                        fbdi_matched_role=best_fbdi_role, sample_values=sample
                    ),
                    "priority": priority,
                    "overlap": best_overlap,
                    "unique_pct": unique_pct,
                })

            rec_rank = {"Strong": 0, "Possible": 1, "Weak": 2}
            candidates_raw.sort(key=lambda x: (
                x["priority"],
                rec_rank.get(x["candidate"].recommendation, 3),
                -x["overlap"],
                -x["unique_pct"],
                x["candidate"].null_pct,
            ))

            top_candidates = [r["candidate"] for r in candidates_raw[:max_candidates]]
            suggested_source_key = top_candidates[0].column_name if top_candidates else None
            suggested_fbdi_key = fbdi_keys_found[0].col_name if fbdi_keys_found else None

            return KeyDetectionResult(
                status="success",
                entity_type=entity_type,
                entity_label=entity_label,
                suggested_source_key=suggested_source_key,
                suggested_fbdi_key=suggested_fbdi_key,
                candidates=top_candidates,
                fbdi_keys_found=[{"role": fk.role, "col_name": fk.col_name, "unique_count": fk.unique_count} for fk in fbdi_keys_found],
                analysis_summary={
                    "source_file": source_name, "fbdi_file": fbdi_name,
                    "source_rows": source_rows, "source_columns": len(source_cols),
                    "fbdi_rows": fbdi_rows, "fbdi_columns": len(fbdi_cols),
                    "entity_type": entity_type, "entity_label": entity_label,
                    "fbdi_keys_detected": len(fbdi_keys_found),
                    "candidates_returned": len(top_candidates),
                    "suggested_source_key": suggested_source_key,
                    "suggested_fbdi_key": suggested_fbdi_key,
                },
                errors=errors,
            )

        except Exception as e:
            errors.append(str(e))
            return KeyDetectionResult(
                status="error", entity_type=None, entity_label=None,
                suggested_source_key=None, suggested_fbdi_key=None,
                candidates=[], fbdi_keys_found=[], analysis_summary={}, errors=errors
            )
