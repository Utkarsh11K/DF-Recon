import pandas as pd
import numpy as np
from difflib import SequenceMatcher
from collections import Counter
from typing import Optional, Dict, Any, List, Tuple
import re

from app.schemas.key_detection_schema import (
    CandidateKeyPair,
    RightKeyValidationResult,
    BasicValidationCheck,
    FullKeyAnalysisResponse
)
from app.services.file_loader import load_dataframe

class KeyDetectionEngine:
    ERP_SYNONYMS = {
        "ORIG_SYSTEM_REFERENCE": ["LEGACY_CUST_ID", "CUSTOMER_ID", "PARTY_ID", "RECORD_ID", "SOURCE_ID", "ID", "CUST_ID", "CLIENT_ID", "CLIENT_CODE", "ACCOUNT_ID"],
        "PARTY_ORIG_SYSTEM_REFERENCE": ["LEGACY_CUST_ID", "CUSTOMER_ID", "PARTY_ID", "RECORD_ID", "SOURCE_ID", "ID", "CUST_ID", "CLIENT_ID"],
        "CUSTOMER_NAME": ["CLIENT_NAME", "CUST_NAME", "PARTY_NAME", "ACCOUNT_NAME", "NAME"],
        "PARTY_NAME": ["CUSTOMER_NAME", "CLIENT_NAME", "CUST_NAME", "ACCOUNT_NAME", "NAME"],
        "ACCOUNT_NUMBER": ["CUSTOMER_NUMBER", "CUST_NUM", "ACCT_NUM", "CLIENT_NUM", "ACCOUNT_NO", "CUSTOMER_NO"],
        "PARTY_NUMBER": ["CUSTOMER_NUMBER", "CUST_NUM", "CLIENT_NUM", "PARTY_NO"],
        "PARTY_ID": ["CUSTOMER_ID", "CUST_ID", "CLIENT_ID"],
    }

    NON_KEY_TERMS = {
        "CITY", "STATE", "COUNTRY", "PROVINCE", "COUNTY", "REGION",
        "ZIP", "POSTAL", "POSTALCODE", "POSTALZIP",
        "STATUS", "FLAG", "INDICATOR", "PURPOSE", "TYPE",
        "ADDRESS", "ADDRESS1", "ADDRESS2", "LINE1", "LINE2", "STREET", "SUITE",
        "PRINT", "STMT", "STATEMENT", "TERMS", "CURRENCY", "PHONE", "FAX", "GENDER"
    }

    KEY_TERMS = {
        "ID", "KEY", "NUM", "NUMBER", "CODE", "REF", "REFERENCE",
        "CUST", "CUSTOMER", "CLIENT", "ACCOUNT", "PARTY", "NAME"
    }

    NULL_STRING_LITERALS = {
        "nan", "none", "null", "n/a", "na", "<na>", "undefined", "", "nil"
    }

    # ─────────────────────────────────────────────────────────────────────────
    # 1. DATA NORMALIZATION
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def normalize_key_value(v: Any) -> Optional[str]:
        """
        Normalizes a single value for key comparison:
        - Return None for None, NaN, empty string, or whitespace-only string.
        - Trim leading/trailing spaces.
        - Normalize repeated whitespace characters into a single space.
        - Case-insensitive comparison (lowercase).
        - Consistent float integer representation (e.g. 123.0 -> '123').
        - Discard null string literals ('nan', 'none', 'null', 'n/a', '<na>', etc.).
        """
        if v is None:
            return None
        if isinstance(v, (float, np.floating)) and np.isnan(v):
            return None

        # Check float integer representation (e.g. 123.0)
        if isinstance(v, (float, np.floating)) and float(v).is_integer():
            s = str(int(v))
        else:
            s = str(v).strip()
            if s.endswith(".0") and s[:-2].isdigit():
                s = s[:-2]

        # Collapse multiple whitespace characters into single space
        s = re.sub(r"\s+", " ", s).strip()
        s_lower = s.lower()

        if not s_lower or s_lower in KeyDetectionEngine.NULL_STRING_LITERALS:
            return None
        return s_lower

    @staticmethod
    def _extract_normalized_value_set(series: pd.Series) -> set[str]:
        """Extract a clean, normalized set of non-null string values from a pandas Series."""
        vals = set()
        for v in series:
            norm = KeyDetectionEngine.normalize_key_value(v)
            if norm is not None:
                vals.add(norm)
        return vals

    @staticmethod
    def _clean_col_name(col: str) -> str:
        return col.lstrip("*").strip().upper().replace(" ", "_")

    @staticmethod
    def _is_non_key_attr(col: str) -> bool:
        c = KeyDetectionEngine._clean_col_name(col)
        parts = re.split(r"[^A-Z0-9]+", c)
        return any(p in KeyDetectionEngine.NON_KEY_TERMS for p in parts if p)

    @staticmethod
    def _has_key_term(col: str) -> bool:
        c = KeyDetectionEngine._clean_col_name(col)
        parts = re.split(r"[^A-Z0-9]+", c)
        return any(p in KeyDetectionEngine.KEY_TERMS for p in parts if p)

    @staticmethod
    def _calculate_name_similarity(col1: str, col2: str) -> float:
        c1 = KeyDetectionEngine._clean_col_name(col1)
        c2 = KeyDetectionEngine._clean_col_name(col2)
        if c1 == c2 or c1.replace("_", "") == c2.replace("_", ""):
            return 100.0

        for fbdi_col, src_cols in KeyDetectionEngine.ERP_SYNONYMS.items():
            if (c1 == fbdi_col and any(c2 == s or c2.replace("_", "") == s.replace("_", "") for s in src_cols)) or \
               (c2 == fbdi_col and any(c1 == s or c1.replace("_", "") == s.replace("_", "") for s in src_cols)):
                return 95.0

        return SequenceMatcher(None, c1.replace("_", ""), c2.replace("_", "")).ratio() * 100.0

    @staticmethod
    def _calculate_value_overlap(s1: pd.Series, s2: pd.Series) -> float:
        set1 = KeyDetectionEngine._extract_normalized_value_set(s1)
        set2 = KeyDetectionEngine._extract_normalized_value_set(s2)

        if not set1 or not set2:
            return 0.0

        intersection = set1.intersection(set2)
        return (len(intersection) / len(set1)) * 100.0

    # ─────────────────────────────────────────────────────────────────────────
    # 4 & 5. COLUMN METRICS (Nulls % and Unique %)
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def calculate_column_metrics(series: pd.Series) -> Dict[str, Any]:
        """
        Calculates column metrics strictly according to specification:
        - Nulls % = (number of null/blank values / total rows) * 100
        - Unique % = (unique non-null values / total non-null values) * 100
        """
        total_rows = len(series)
        if total_rows == 0:
            return {
                "total_rows": 0,
                "null_count": 0,
                "non_null_count": 0,
                "nulls_percent": 0.0,
                "unique_values": set(),
                "unique_percent": 0.0,
            }

        norm_list = [KeyDetectionEngine.normalize_key_value(v) for v in series]
        null_count = sum(1 for v in norm_list if v is None)
        non_null_count = total_rows - null_count

        unique_values = {v for v in norm_list if v is not None}
        unique_count = len(unique_values)

        nulls_percent = round((null_count / total_rows) * 100.0, 2)
        unique_percent = round((unique_count / non_null_count) * 100.0, 2) if non_null_count > 0 else 0.0

        return {
            "total_rows": total_rows,
            "null_count": null_count,
            "non_null_count": non_null_count,
            "nulls_percent": nulls_percent,
            "unique_values": unique_values,
            "unique_percent": unique_percent,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # 2, 3 & 6. PAIR METRICS (Common Values, Overlap %, Confidence)
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def calculate_pair_metrics(
        df_src: pd.DataFrame,
        df_tgt: pd.DataFrame,
        src_col: str,
        tgt_col: str
    ) -> CandidateKeyPair:
        """
        Calculates exact metrics for a specific Source ↔ FBDI column pair from data:
        1. Common Values = len(intersection(source_unique_non_null, fbdi_unique_non_null))
        2. Data Overlap % = (Common Values / Source Unique Non-Null Values) * 100
        3. Nulls % = (nulls / total rows) * 100
        4. Unique % = (unique non-null / total non-null) * 100
        5. Confidence = 50% * Data Overlap + 30% * Source Unique % + 20% * Null Quality
           where Null Quality = 100 - Nulls %
        """
        src_series = df_src[src_col] if src_col in df_src.columns else pd.Series(dtype=object)
        tgt_series = df_tgt[tgt_col] if tgt_col in df_tgt.columns else pd.Series(dtype=object)

        src_metrics = KeyDetectionEngine.calculate_column_metrics(src_series)
        tgt_metrics = KeyDetectionEngine.calculate_column_metrics(tgt_series)

        s_vals = src_metrics["unique_values"]
        t_vals = tgt_metrics["unique_values"]

        common_set = s_vals.intersection(t_vals)
        common_count = len(common_set)

        src_unique_count = len(s_vals)
        data_overlap = round((common_count / src_unique_count * 100.0), 2) if src_unique_count > 0 else 0.0

        null_quality = max(0.0, 100.0 - src_metrics["nulls_percent"])
        confidence_calc = (0.50 * data_overlap) + (0.30 * src_metrics["unique_percent"]) + (0.20 * null_quality)
        confidence = round(min(100.0, max(0.0, confidence_calc)), 2)

        # 8. Candidate Classification
        if data_overlap >= 75.0 and src_metrics["unique_percent"] >= 90.0 and src_metrics["nulls_percent"] <= 5.0:
            category = "Strong candidate key"
        elif data_overlap >= 50.0 and src_metrics["unique_percent"] >= 60.0 and src_metrics["nulls_percent"] <= 20.0:
            category = "Possible candidate"
        elif data_overlap > 0.0:
            category = "Weak candidate"
        else:
            category = "Invalid candidate"

        name_sim = KeyDetectionEngine._calculate_name_similarity(src_col, tgt_col)
        explanation = f"{common_count} distinct common values ({data_overlap:.2f}% overlap), {src_metrics['unique_percent']:.2f}% unique, {src_metrics['nulls_percent']:.2f}% nulls · {category}"

        return CandidateKeyPair(
            source_column=src_col,
            target_column=tgt_col,
            confidence=confidence,
            explanation=explanation,
            source_null_percent=src_metrics["nulls_percent"],
            target_null_percent=tgt_metrics["nulls_percent"],
            source_unique_percent=src_metrics["unique_percent"],
            target_unique_percent=tgt_metrics["unique_percent"],
            name_similarity=round(name_sim, 2),
            value_overlap_ratio=data_overlap,
            common_value_count=common_count,
            # Canonical aliases
            fbdi_column=tgt_col,
            common_values=common_count,
            data_overlap=data_overlap,
            nulls_percent=src_metrics["nulls_percent"],
            unique_percent=src_metrics["unique_percent"],
            category=category,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # DYNAMIC KEY DETECTION (Over All Columns & Top Candidates)
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def detect_candidate_keys(
        source_file_path: str,
        target_file_path: str,
        top_n: int = 5,
        return_all_source_columns: bool = False
    ) -> Any:
        try:
            df_src = load_dataframe(source_file_path)
            if df_src is None or df_src.empty:
                df_src = pd.read_csv(source_file_path, low_memory=False)
        except Exception:
            try:
                df_src = pd.read_csv(source_file_path, low_memory=False)
            except Exception as e:
                print(f"Error loading source file '{source_file_path}': {e}")
                return ([], []) if return_all_source_columns else []

        try:
            df_tgt = load_dataframe(target_file_path)
            if df_tgt is None or df_tgt.empty:
                df_tgt = pd.read_csv(target_file_path, low_memory=False)
        except Exception:
            try:
                df_tgt = pd.read_csv(target_file_path, low_memory=False)
            except Exception as e:
                print(f"Error loading target/FBDI file '{target_file_path}': {e}")
                return ([], []) if return_all_source_columns else []

        if df_src is None or df_tgt is None or df_src.empty or df_tgt.empty:
            return ([], []) if return_all_source_columns else []

        # Precompute metrics for all columns
        src_metrics_map = {col: KeyDetectionEngine.calculate_column_metrics(df_src[col]) for col in df_src.columns}
        tgt_metrics_map = {col: KeyDetectionEngine.calculate_column_metrics(df_tgt[col]) for col in df_tgt.columns}

        # Calculate best FBDI match for EVERY source column
        all_source_pairs: List[CandidateKeyPair] = []
        all_evaluated_pairs: List[CandidateKeyPair] = []

        for src_col, s_meta in src_metrics_map.items():
            s_vals = s_meta["unique_values"]
            src_unique_count = len(s_vals)

            best_match: Optional[CandidateKeyPair] = None
            best_match_score = -1.0

            for tgt_col, t_meta in tgt_metrics_map.items():
                t_vals = t_meta["unique_values"]
                common_set = s_vals.intersection(t_vals)
                common_count = len(common_set)

                data_overlap = round((common_count / src_unique_count * 100.0), 2) if src_unique_count > 0 else 0.0
                null_quality = max(0.0, 100.0 - s_meta["nulls_percent"])
                confidence = round(min(100.0, max(0.0, (0.50 * data_overlap) + (0.30 * s_meta["unique_percent"]) + (0.20 * null_quality))), 2)

                name_sim = KeyDetectionEngine._calculate_name_similarity(src_col, tgt_col)

                if data_overlap >= 75.0 and s_meta["unique_percent"] >= 90.0 and s_meta["nulls_percent"] <= 5.0:
                    category = "Strong candidate key"
                elif data_overlap >= 50.0 and s_meta["unique_percent"] >= 60.0 and s_meta["nulls_percent"] <= 20.0:
                    category = "Possible candidate"
                elif data_overlap > 0.0:
                    category = "Weak candidate"
                else:
                    category = "Invalid candidate"

                pair_candidate = CandidateKeyPair(
                    source_column=src_col,
                    target_column=tgt_col,
                    confidence=confidence,
                    explanation=f"{common_count} distinct common values ({data_overlap:.2f}% overlap), {s_meta['unique_percent']:.2f}% unique, {s_meta['nulls_percent']:.2f}% nulls · {category}",
                    source_null_percent=s_meta["nulls_percent"],
                    target_null_percent=t_meta["nulls_percent"],
                    source_unique_percent=s_meta["unique_percent"],
                    target_unique_percent=t_meta["unique_percent"],
                    name_similarity=round(name_sim, 2),
                    value_overlap_ratio=data_overlap,
                    common_value_count=common_count,
                    fbdi_column=tgt_col,
                    common_values=common_count,
                    data_overlap=data_overlap,
                    nulls_percent=s_meta["nulls_percent"],
                    unique_percent=s_meta["unique_percent"],
                    category=category,
                )

                if common_count > 0:
                    all_evaluated_pairs.append(pair_candidate)

                # Composite score to select best matching FBDI column for this source column
                selection_score = (data_overlap * 10.0) + (common_count * 2.0) + (name_sim * 0.5)
                if selection_score > best_match_score:
                    best_match_score = selection_score
                    best_match = pair_candidate

            # If no common values with any FBDI column, pick best name similarity as default suggestion
            if best_match is None or best_match_score <= 0.0:
                best_tgt_col = max(df_tgt.columns, key=lambda tc: KeyDetectionEngine._calculate_name_similarity(src_col, tc))
                best_match = KeyDetectionEngine.calculate_pair_metrics(df_src, df_tgt, src_col, best_tgt_col)

            all_source_pairs.append(best_match)

        # Build top candidates list
        # If pairs with common values exist, rank them; otherwise fallback to top schema name matches
        if all_evaluated_pairs:
            # Sort by: Data Overlap desc, Confidence desc, Common Values desc, Source Uniqueness desc
            all_evaluated_pairs.sort(
                key=lambda x: (x.value_overlap_ratio, x.confidence, x.common_value_count, x.source_unique_percent),
                reverse=True
            )
            # Deduplicate (keep best target per source column and best source per target column)
            seen_src = set()
            seen_tgt = set()
            top_candidates = []
            for c in all_evaluated_pairs:
                if c.source_column not in seen_src and c.target_column not in seen_tgt:
                    top_candidates.append(c)
                    seen_src.add(c.source_column)
                    seen_tgt.add(c.target_column)

            if len(top_candidates) < top_n:
                for c in all_evaluated_pairs:
                    if c.source_column not in seen_src:
                        top_candidates.append(c)
                        seen_src.add(c.source_column)
                    if len(top_candidates) >= top_n:
                        break
        else:
            # Fallback schema name matches
            top_candidates = sorted(all_source_pairs, key=lambda x: (x.name_similarity, x.source_unique_percent), reverse=True)[:top_n]

        if return_all_source_columns:
            return top_candidates[:top_n], all_source_pairs
        return top_candidates[:top_n]

    # ─────────────────────────────────────────────────────────────────────────
    # RELATIONSHIP VALIDATION
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def validate_right_key(df_src: pd.DataFrame, df_tgt: pd.DataFrame, src_col: str, tgt_col: str) -> RightKeyValidationResult:
        if src_col not in df_src.columns or tgt_col not in df_tgt.columns:
            return RightKeyValidationResult(
                cardinality="N:M",
                overlap_ratio=0.0,
                common_keys_count=0,
                orphan_source_count=0,
                orphan_target_count=0,
                status="INVALID",
                explanation="One or both key columns do not exist in the files."
            )

        s1_norm = [KeyDetectionEngine.normalize_key_value(v) for v in df_src[src_col]]
        s2_norm = [KeyDetectionEngine.normalize_key_value(v) for v in df_tgt[tgt_col]]

        s1_valid = [v for v in s1_norm if v is not None]
        s2_valid = [v for v in s2_norm if v is not None]

        set1 = set(s1_valid)
        set2 = set(s2_valid)

        common_set = set1.intersection(set2)
        common_count = len(common_set)
        orphan_src = len(set1 - set2)
        orphan_tgt = len(set2 - set1)

        overlap_ratio = (common_count / len(set1) * 100.0) if len(set1) > 0 else 0.0

        # Cardinality based on normalized non-null keys
        src_counts = Counter(s1_valid)
        tgt_counts = Counter(s2_valid)

        src_has_dups = any(cnt > 1 for cnt in src_counts.values())
        tgt_has_dups = any(cnt > 1 for cnt in tgt_counts.values())

        if not src_has_dups and not tgt_has_dups:
            cardinality = "1:1"
        elif not src_has_dups and tgt_has_dups:
            cardinality = "1:N"
        elif src_has_dups and not tgt_has_dups:
            cardinality = "N:1"
        else:
            cardinality = "N:M"

        status = "VALID"
        explanation = "Key pair appears valid."

        if overlap_ratio < 10.0:
            status = "INVALID"
            explanation = "Very low value overlap between keys."
        elif cardinality == "N:M":
            status = "SUSPICIOUS"
            explanation = "Many-to-Many relationship detected, usually not ideal for primary keys."
        elif len(set2) > 0 and (orphan_tgt > len(set2) * 0.5):
            status = "SUSPICIOUS"
            explanation = "High number of orphan records in target data."

        return RightKeyValidationResult(
            cardinality=cardinality,
            overlap_ratio=round(overlap_ratio, 2),
            common_keys_count=common_count,
            orphan_source_count=orphan_src,
            orphan_target_count=orphan_tgt,
            status=status,
            explanation=explanation
        )

    @staticmethod
    def validate_basic_key_integrity(df_src: pd.DataFrame, df_tgt: pd.DataFrame, src_col: str, tgt_col: str) -> BasicValidationCheck:
        src_exists = src_col in df_src.columns
        tgt_exists = tgt_col in df_tgt.columns

        if not src_exists or not tgt_exists:
            return BasicValidationCheck(
                source_column_exists=src_exists,
                target_column_exists=tgt_exists,
                source_nulls_count=0,
                target_nulls_count=0,
                source_duplicates_count=0,
                target_duplicates_count=0,
                types_compatible=False
            )

        s1_raw = df_src[src_col]
        s2_raw = df_tgt[tgt_col]

        s1_norm = [KeyDetectionEngine.normalize_key_value(v) for v in s1_raw]
        s2_norm = [KeyDetectionEngine.normalize_key_value(v) for v in s2_raw]

        src_nulls = sum(1 for v in s1_norm if v is None)
        tgt_nulls = sum(1 for v in s2_norm if v is None)

        s1_valid = [v for v in s1_norm if v is not None]
        s2_valid = [v for v in s2_norm if v is not None]

        src_dups = len(s1_valid) - len(set(s1_valid))
        tgt_dups = len(s2_valid) - len(set(s2_valid))

        types_compatible = True
        try:
            pd.to_numeric(pd.Series(s1_valid).dropna())
            s1_num = True
        except Exception:
            s1_num = False

        try:
            pd.to_numeric(pd.Series(s2_valid).dropna())
            s2_num = True
        except Exception:
            s2_num = False

        if s1_valid and s2_valid and (s1_num != s2_num):
            types_compatible = False

        return BasicValidationCheck(
            source_column_exists=src_exists,
            target_column_exists=tgt_exists,
            source_nulls_count=src_nulls,
            target_nulls_count=tgt_nulls,
            source_duplicates_count=src_dups,
            target_duplicates_count=tgt_dups,
            types_compatible=types_compatible
        )
