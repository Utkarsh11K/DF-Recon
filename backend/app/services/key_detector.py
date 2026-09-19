import pandas as pd
import numpy as np
from difflib import SequenceMatcher
from collections import Counter
from typing import Optional, Dict, Any, List, Tuple, Union
import re
import itertools

from app.schemas.key_detection_schema import (
    CandidateKeyPair,
    RightKeyValidationResult,
    BasicValidationCheck,
    FullKeyAnalysisResponse,
    KeyDetectionResponse,
    CustomKeyValidationResult,
    TargetKeyMatchResult,
    TargetDirectedKeyDetectionResponse,
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
    def _is_target_entity_key(tgt_name: str) -> int:
        clean = KeyDetectionEngine._clean_col_name(tgt_name)
        parts = re.split(r"[^A-Z0-9]+", clean)
        has_non_key = any(p in KeyDetectionEngine.NON_KEY_TERMS for p in parts if p)
        if has_non_key:
            return 0
        has_key = any(p in KeyDetectionEngine.KEY_TERMS for p in parts if p)
        return 1 if (has_key or tgt_name.strip().startswith("*")) else 0

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
        Treats NaN, None, "", whitespace-only, "nan", "none", "null" as missing.
        """
        total_rows = len(series)
        if total_rows == 0:
            return {
                "total_rows": 0,
                "null_count": 0,
                "non_null_count": 0,
                "nulls_percent": 0.0,
                "null_pct": 0.0,
                "unique_values": set(),
                "unique_percent": 0.0,
            }

        missing_mask = (
            series.isna()
            | series.astype(str).str.strip().str.lower().isin(
                ["", "nan", "none", "null", "n/a", "na", "<na>", "undefined", "nil"]
            )
        )
        null_count = int(missing_mask.sum())
        null_pct = round((null_count / total_rows) * 100.0, 2)
        non_null_count = total_rows - null_count

        non_null_series = series[~missing_mask]
        norm_list = [KeyDetectionEngine.normalize_key_value(v) for v in non_null_series]
        unique_values = {v for v in norm_list if v is not None}
        unique_count = len(unique_values)

        unique_percent = round((unique_count / non_null_count) * 100.0, 2) if non_null_count > 0 else 0.0

        return {
            "total_rows": total_rows,
            "null_count": null_count,
            "non_null_count": non_null_count,
            "nulls_percent": null_pct,
            "null_pct": null_pct,
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
        Calculates exact metrics for a specific Source <-> FBDI column pair from data:
        1. Common Values = len(intersection(source_unique_non_null, fbdi_unique_non_null))
        2. Data Overlap % = (Common Values / Source Unique Non-Null Values) * 100
        3. Nulls % = (nulls / total rows) * 100
        4. Unique % = (unique non-null / total non-null) * 100
        5. Confidence = 50% * Data Overlap + 30% * Source Unique % + 20% * Null Quality
           where Null Quality = 100 - Nulls %
        6. Strict Candidate Key Gate:
           A column can be considered a Candidate Key ONLY IF it contains ZERO NULL or BLANK values.
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

        null_count = src_metrics["null_count"]
        null_pct = src_metrics["nulls_percent"]

        # Base candidate classification for zero-null columns
        if data_overlap >= 75.0 and src_metrics["unique_percent"] >= 90.0:
            recommendation = "Strong"
            category = "Strong candidate key"
        elif data_overlap >= 50.0 and src_metrics["unique_percent"] >= 60.0:
            recommendation = "Possible"
            category = "Possible candidate"
        elif data_overlap > 0.0:
            recommendation = "Weak"
            category = "Weak candidate"
        else:
            recommendation = "Weak"
            category = "Invalid candidate"

        reason = None
        # Strict Candidate Key Rule:
        # If null_count > 0, reject candidate key
        if null_count > 0:
            recommendation = "Weak"
            category = "Weak candidate"
            reason = (
                f"Rejected as candidate key because it contains "
                f"{null_count} null/blank values ({null_pct}%)."
            )

        name_sim = KeyDetectionEngine._calculate_name_similarity(src_col, tgt_col)
        explanation = f"{common_count} distinct common values ({data_overlap:.2f}% overlap), {src_metrics['unique_percent']:.2f}% unique, {src_metrics['nulls_percent']:.2f}% nulls · {category}"
        if reason:
            explanation += f" ({reason})"

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
            fbdi_column=tgt_col,
            common_values=common_count,
            data_overlap=data_overlap,
            nulls_percent=src_metrics["nulls_percent"],
            unique_percent=src_metrics["unique_percent"],
            category=category,
            recommendation=recommendation,
            null_count=null_count,
            null_pct=null_pct,
            column_names=[src_col],
            is_composite=False,
            reason=reason,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # COMPOSITE KEY DETECTION
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def detect_composite_candidates(
        df_src: pd.DataFrame,
        df_tgt: Optional[pd.DataFrame] = None,
        max_cols: int = 2
    ) -> List[CandidateKeyPair]:
        """
        Detects composite key candidates from columns having strictly ZERO null/blank values.
        A composite key is valid ONLY when EVERY component column has zero null/blank values.
        """
        if df_src is None or df_src.empty:
            return []

        total_rows = len(df_src)
        if total_rows == 0:
            return []

        # 1. Identify columns with zero nulls
        clean_cols = []
        for col in df_src.columns:
            series = df_src[col]
            missing_mask = (
                series.isna()
                | series.astype(str).str.strip().str.lower().isin(
                    ["", "nan", "none", "null", "n/a", "na", "<na>", "undefined", "nil"]
                )
            )
            if int(missing_mask.sum()) == 0:
                clean_cols.append(col)

        # Need at least 2 clean columns for composite key
        if len(clean_cols) < 2:
            return []

        composite_candidates: List[CandidateKeyPair] = []

        for col1, col2 in itertools.combinations(clean_cols, 2):
            s1 = df_src[col1].astype(str).str.strip().str.lower()
            s2 = df_src[col2].astype(str).str.strip().str.lower()
            combined = s1 + "___" + s2

            unique_count = combined.nunique()
            unique_pct = round((unique_count / total_rows) * 100.0, 2)

            # Look for high composite uniqueness (>= 80%)
            if unique_pct < 80.0:
                continue

            target_col_combined = None
            data_overlap = 0.0
            common_count = 0
            if df_tgt is not None and not df_tgt.empty:
                t_match1 = max(df_tgt.columns, key=lambda tc: KeyDetectionEngine._calculate_name_similarity(col1, tc)) if len(df_tgt.columns) > 0 else None
                t_match2 = max(df_tgt.columns, key=lambda tc: KeyDetectionEngine._calculate_name_similarity(col2, tc)) if len(df_tgt.columns) > 0 else None
                if t_match1 and t_match2 and t_match1 != t_match2:
                    t_comb = df_tgt[t_match1].astype(str).str.strip().str.lower() + "___" + df_tgt[t_match2].astype(str).str.strip().str.lower()
                    common_set = set(combined).intersection(set(t_comb))
                    common_count = len(common_set)
                    data_overlap = round((common_count / unique_count * 100.0), 2) if unique_count > 0 else 0.0
                    target_col_combined = f"{t_match1} + {t_match2}"

            if unique_pct == 100.0 and (data_overlap >= 75.0 or df_tgt is None):
                recommendation = "Strong"
                category = "Strong candidate key"
            elif unique_pct >= 90.0 and (data_overlap >= 50.0 or df_tgt is None):
                recommendation = "Possible"
                category = "Possible candidate"
            else:
                recommendation = "Weak"
                category = "Weak candidate"

            conf_calc = (0.50 * data_overlap) + (0.30 * unique_pct) + (0.20 * 100.0) if df_tgt is not None else unique_pct
            confidence = round(min(100.0, max(0.0, conf_calc)), 2)

            composite_candidates.append(CandidateKeyPair(
                source_column=f"{col1} + {col2}",
                target_column=target_col_combined or f"{col1} + {col2}",
                confidence=confidence,
                explanation=f"Composite key ({col1} + {col2}): {unique_pct}% unique, 0 nulls · {category}",
                source_null_percent=0.0,
                target_null_percent=0.0,
                source_unique_percent=unique_pct,
                target_unique_percent=100.0,
                name_similarity=90.0,
                value_overlap_ratio=data_overlap,
                common_value_count=common_count,
                fbdi_column=target_col_combined or f"{col1} + {col2}",
                common_values=common_count,
                data_overlap=data_overlap,
                nulls_percent=0.0,
                unique_percent=unique_pct,
                category=category,
                recommendation=recommendation,
                null_count=0,
                null_pct=0.0,
                column_names=[col1, col2],
                is_composite=True,
                reason=None,
            ))

        composite_candidates.sort(key=lambda c: (c.confidence, c.unique_percent), reverse=True)
        return composite_candidates

    # ─────────────────────────────────────────────────────────────────────────
    # DYNAMIC KEY DETECTION (Over All Columns & Top Candidates)
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def detect_candidate_keys(
        source_file_path: Union[str, pd.DataFrame],
        target_file_path: Union[str, pd.DataFrame],
        top_n: int = 5,
        return_all_source_columns: bool = False
    ) -> Any:
        try:
            if isinstance(source_file_path, pd.DataFrame):
                df_src = source_file_path
            else:
                df_src = load_dataframe(source_file_path)
                if df_src is None or df_src.empty:
                    df_src = pd.read_csv(source_file_path, low_memory=False)
        except Exception as e:
            try:
                df_src = pd.read_csv(source_file_path, low_memory=False)
            except Exception:
                print(f"Error loading source file '{source_file_path}': {e}")
                return ([], []) if return_all_source_columns else []

        try:
            if isinstance(target_file_path, pd.DataFrame):
                df_tgt = target_file_path
            else:
                df_tgt = load_dataframe(target_file_path)
                if df_tgt is None or df_tgt.empty:
                    df_tgt = pd.read_csv(target_file_path, low_memory=False)
        except Exception as e:
            try:
                df_tgt = pd.read_csv(target_file_path, low_memory=False)
            except Exception:
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

                null_count = s_meta["null_count"]
                null_pct = s_meta["nulls_percent"]

                if data_overlap >= 75.0 and s_meta["unique_percent"] >= 90.0:
                    recommendation = "Strong"
                    category = "Strong candidate key"
                elif data_overlap >= 50.0 and s_meta["unique_percent"] >= 60.0:
                    recommendation = "Possible"
                    category = "Possible candidate"
                elif data_overlap > 0.0:
                    recommendation = "Weak"
                    category = "Weak candidate"
                else:
                    recommendation = "Weak"
                    category = "Invalid candidate"

                reason = None
                # Strict Candidate Key Rule:
                # If null_count > 0, reject candidate key
                if null_count > 0:
                    recommendation = "Weak"
                    category = "Weak candidate"
                    reason = (
                        f"Rejected as candidate key because it contains "
                        f"{null_count} null/blank values ({null_pct}%)."
                    )

                explanation = f"{common_count} distinct common values ({data_overlap:.2f}% overlap), {s_meta['unique_percent']:.2f}% unique, {s_meta['nulls_percent']:.2f}% nulls · {category}"
                if reason:
                    explanation += f" ({reason})"

                pair_candidate = CandidateKeyPair(
                    source_column=src_col,
                    target_column=tgt_col,
                    confidence=confidence,
                    explanation=explanation,
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
                    recommendation=recommendation,
                    null_count=null_count,
                    null_pct=null_pct,
                    column_names=[src_col],
                    is_composite=False,
                    reason=reason,
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

        # Filter valid candidates (recommendation in ["Strong", "Possible"] and null_count == 0)
        valid_evaluated_pairs = [
            c for c in all_evaluated_pairs
            if c.recommendation in ["Strong", "Possible"] and (c.null_count or 0) == 0 and c.nulls_percent == 0.0
        ]

        # Build top candidates list
        if valid_evaluated_pairs:
            # Sort valid candidates by Target Entity Key priority desc, Data Overlap desc, Confidence desc, Common Values desc, Source Uniqueness desc
            valid_evaluated_pairs.sort(
                key=lambda x: (
                    KeyDetectionEngine._is_target_entity_key(x.target_column),
                    x.value_overlap_ratio,
                    x.confidence,
                    x.common_value_count,
                    x.source_unique_percent
                ),
                reverse=True
            )
            seen_src = set()
            seen_tgt = set()
            top_candidates = []
            for c in valid_evaluated_pairs:
                if c.source_column not in seen_src and c.target_column not in seen_tgt:
                    top_candidates.append(c)
                    seen_src.add(c.source_column)
                    seen_tgt.add(c.target_column)

            if len(top_candidates) < top_n:
                for c in valid_evaluated_pairs:
                    if c.source_column not in seen_src:
                        top_candidates.append(c)
                        seen_src.add(c.source_column)
                    if len(top_candidates) >= top_n:
                        break
        else:
            # Fallback schema name matches among zero-null columns if any
            clean_source_pairs = [
                c for c in all_source_pairs
                if c.recommendation in ["Strong", "Possible"] and (c.null_count or 0) == 0 and c.nulls_percent == 0.0
            ]
            top_candidates = sorted(clean_source_pairs, key=lambda x: (x.name_similarity, x.source_unique_percent), reverse=True)[:top_n]

        if return_all_source_columns:
            return top_candidates[:top_n], all_source_pairs
        return top_candidates[:top_n]

    @staticmethod
    def detect_candidate_keys_full(
        source_file_path: Union[str, pd.DataFrame],
        target_file_path: Union[str, pd.DataFrame],
        top_n: int = 5
    ) -> KeyDetectionResponse:
        """
        Full detection returning structured KeyDetectionResponse including:
        - candidates (top N valid candidates)
        - all_source_columns (all source columns evaluated)
        - single_col_candidates (strict recommendation in ["Strong", "Possible"] and null_count == 0)
        - composite_candidates (composite keys with zero nulls)
        - suggested_primary_key (first valid candidate or [])
        """
        top_candidates, all_source_cols = KeyDetectionEngine.detect_candidate_keys(
            source_file_path, target_file_path, top_n=top_n, return_all_source_columns=True
        )

        try:
            if isinstance(source_file_path, pd.DataFrame):
                df_src = source_file_path
            else:
                df_src = load_dataframe(source_file_path)
                if df_src is None or df_src.empty:
                    df_src = pd.read_csv(source_file_path, low_memory=False)
        except Exception:
            df_src = pd.DataFrame()

        try:
            if isinstance(target_file_path, pd.DataFrame):
                df_tgt = target_file_path
            else:
                df_tgt = load_dataframe(target_file_path)
                if df_tgt is None or df_tgt.empty:
                    df_tgt = pd.read_csv(target_file_path, low_memory=False)
        except Exception:
            df_tgt = pd.DataFrame()

        # 4. single_col_candidates: Only add a column when recommendation in ["Strong", "Possible"] and null_count == 0
        single_col_candidates = [
            c for c in top_candidates
            if c.recommendation in ["Strong", "Possible"] and (c.null_count or 0) == 0 and c.nulls_percent == 0.0
        ]

        # 6. Composite Key candidates
        composite_candidates = KeyDetectionEngine.detect_composite_candidates(df_src, df_tgt)

        # 5. Suggested Primary Key: must come ONLY from valid single column candidates with recommendation in ["Strong", "Possible"] and null_pct == 0
        # User constraint: "only ONE column should be considered as the Primary Key. Do not use multiple columns as Primary Keys and do not hardcode the key."
        suggested_primary_key = [single_col_candidates[0].source_column] if single_col_candidates else []

        return KeyDetectionResponse(
            candidates=top_candidates,
            all_source_columns=all_source_cols,
            single_col_candidates=single_col_candidates,
            composite_candidates=composite_candidates,
            suggested_primary_key=suggested_primary_key
        )

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

        missing_mask_s1 = (
            df_src[src_col].isna()
            | df_src[src_col].astype(str).str.strip().str.lower().isin(
                ["", "nan", "none", "null", "n/a", "na", "<na>", "undefined", "nil"]
            )
        )
        src_nulls = int(missing_mask_s1.sum())

        missing_mask_s2 = (
            df_tgt[tgt_col].isna()
            | df_tgt[tgt_col].astype(str).str.strip().str.lower().isin(
                ["", "nan", "none", "null", "n/a", "na", "<na>", "undefined", "nil"]
            )
        )
        tgt_nulls = int(missing_mask_s2.sum())

        s1_raw = df_src[src_col]
        s2_raw = df_tgt[tgt_col]

        s1_norm = [KeyDetectionEngine.normalize_key_value(v) for v in s1_raw]
        s2_norm = [KeyDetectionEngine.normalize_key_value(v) for v in s2_raw]

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

    # ─────────────────────────────────────────────────────────────────────────
    # 7. MANUAL KEY VALIDATION (Single or Composite)
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def validate_custom_key(
        df: pd.DataFrame,
        key_columns: Union[str, List[str]]
    ) -> Dict[str, Any]:
        """
        Validates a custom key (single column or composite) strictly according to rule:
        The selected key is valid ONLY when:
          blank_key_count == 0 and duplicate_key_count == 0
        Therefore:
          NULL/blank exists -> is_valid = False
          Duplicate key exists -> is_valid = False
          No NULL/blank + unique -> is_valid = True
        """
        if isinstance(key_columns, str):
            cols = [key_columns]
        else:
            cols = list(key_columns)

        total_records = len(df) if df is not None else 0
        if total_records == 0:
            return {
                "is_valid": False,
                "total_records": 0,
                "unique_keys_count": 0,
                "duplicate_key_count": 0,
                "null_key_count": 0,
                "blank_key_count": 0,
                "uniqueness_pct": 0.0,
                "duplicate_drilldown": [],
                "validation_checks": {
                    "columns_exist": False,
                    "zero_nulls": False,
                    "zero_duplicates": False,
                },
                "explanation": "No data found to validate key."
            }

        missing_cols = [c for c in cols if c not in df.columns]
        if missing_cols:
            return {
                "is_valid": False,
                "total_records": total_records,
                "unique_keys_count": 0,
                "duplicate_key_count": 0,
                "null_key_count": 0,
                "blank_key_count": 0,
                "uniqueness_pct": 0.0,
                "duplicate_drilldown": [],
                "validation_checks": {
                    "columns_exist": False,
                    "zero_nulls": False,
                    "zero_duplicates": False,
                },
                "explanation": f"Column(s) not found in dataset: {missing_cols}"
            }

        missing_masks = []
        for col in cols:
            series = df[col]
            mask = (
                series.isna()
                | series.astype(str).str.strip().str.lower().isin(
                    ["", "nan", "none", "null", "n/a", "na", "<na>", "undefined", "nil"]
                )
            )
            missing_masks.append(mask)

        # If any component column has a missing value in that row, key is considered blank/null
        row_missing_mask = pd.concat(missing_masks, axis=1).any(axis=1)
        blank_key_count = int(row_missing_mask.sum())
        null_key_count = blank_key_count

        # Build normalized representation of key per row
        if len(cols) == 1:
            key_series = df[cols[0]].astype(str).str.strip().str.lower()
        else:
            key_series = df[cols].astype(str).apply(lambda row: "___".join(row.str.strip().str.lower()), axis=1)

        counts = Counter(key_series)
        unique_keys_count = len(counts)
        duplicate_key_count = total_records - unique_keys_count
        uniqueness_pct = round((unique_keys_count / total_records) * 100.0, 2) if total_records > 0 else 0.0

        duplicate_drilldown = [
            {"key": k, "count": cnt}
            for k, cnt in counts.items()
            if cnt > 1
        ]
        duplicate_drilldown.sort(key=lambda x: x["count"], reverse=True)

        zero_nulls = (blank_key_count == 0)
        zero_duplicates = (duplicate_key_count == 0)

        # Strict validation rule:
        # blank_key_count == 0 and duplicate_key_count == 0
        is_valid = zero_nulls and zero_duplicates

        explanation_parts = []
        if not zero_nulls:
            explanation_parts.append(f"{blank_key_count} null/blank keys found")
        if not zero_duplicates:
            explanation_parts.append(f"{duplicate_key_count} duplicate keys found")

        if is_valid:
            explanation = "Valid unique key with zero null/blank values."
        else:
            explanation = f"Invalid key: {', '.join(explanation_parts)}."

        return {
            "is_valid": is_valid,
            "total_records": total_records,
            "unique_keys_count": unique_keys_count,
            "duplicate_key_count": duplicate_key_count,
            "null_key_count": null_key_count,
            "blank_key_count": blank_key_count,
            "uniqueness_pct": uniqueness_pct,
            "duplicate_drilldown": duplicate_drilldown,
            "validation_checks": {
                "columns_exist": True,
                "zero_nulls": zero_nulls,
                "zero_duplicates": zero_duplicates,
            },
            "explanation": explanation
        }

    # ─────────────────────────────────────────────────────────────────────────
    # 8. TARGET-DIRECTED DYNAMIC SOURCE KEY DETECTION
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def detect_key_for_target_column(
        source_file_path: Union[str, pd.DataFrame],
        target_file_path: Union[str, pd.DataFrame],
        target_column: str = "*Customer Name",
        source_sheet: Optional[str] = None,
        target_sheet: Optional[str] = None,
    ) -> TargetDirectedKeyDetectionResponse:
        """
        Dynamically detects which Source column matches a known/static Target key
        (e.g., ADFDI '*Customer Name') by analyzing actual data values:
        - Source-side key is NOT hardcoded.
        - Strictly enforces 0% null/blank values for candidates.
        - Calculates exact metrics: common values, data overlap %, match ratio %,
          null %, unique count, duplicate status, and confidence score.
        - Validates the relationship (PASS / FAIL) and selects the best Source key.
        """
        if isinstance(source_file_path, pd.DataFrame):
            df_src = source_file_path
        else:
            df_src = load_dataframe(source_file_path, sheet_name=source_sheet)
            if df_src is None or df_src.empty:
                try:
                    df_src = pd.read_csv(source_file_path, low_memory=False)
                except Exception:
                    df_src = pd.DataFrame()

        if isinstance(target_file_path, pd.DataFrame):
            df_tgt = target_file_path
        else:
            df_tgt = load_dataframe(target_file_path, sheet_name=target_sheet, target_column=target_column)
            if df_tgt is None or df_tgt.empty:
                try:
                    df_tgt = pd.read_csv(target_file_path, low_memory=False)
                except Exception:
                    df_tgt = pd.DataFrame()

        if df_src.empty:
            return TargetDirectedKeyDetectionResponse(
                best_match=None,
                all_evaluated_columns=[],
                target_column=target_column,
                source_file=source_file_path,
                target_file=target_file_path,
            )

        if df_tgt.empty:
            return TargetDirectedKeyDetectionResponse(
                best_match=None,
                all_evaluated_columns=[],
                target_column=target_column,
                source_file=source_file_path,
                target_file=target_file_path,
            )

        # Resolve exact target column in df_tgt (handling asterisks / case differences)
        tgt_col_actual = None
        if target_column in df_tgt.columns:
            tgt_col_actual = target_column
        else:
            tgt_norm = target_column.lstrip("*").strip().lower()
            for col in df_tgt.columns:
                if col.lstrip("*").strip().lower() == tgt_norm:
                    tgt_col_actual = col
                    break

        if not tgt_col_actual:
            return TargetDirectedKeyDetectionResponse(
                best_match=None,
                all_evaluated_columns=[],
                target_column=target_column,
                source_file=source_file_path,
                target_file=target_file_path,
            )

        # Profile target column
        tgt_series = df_tgt[tgt_col_actual]
        t_norm_list = [KeyDetectionEngine.normalize_key_value(v) for v in tgt_series]
        t_valid_vals = [v for v in t_norm_list if v is not None]
        target_set = set(t_valid_vals)
        target_unique_count = len(target_set)
        target_record_count = len(tgt_series)

        all_results: List[TargetKeyMatchResult] = []
        pass_candidates: List[TargetKeyMatchResult] = []

        total_src_rows = len(df_src)

        for col in df_src.columns:
            series = df_src[col]
            missing_mask = (
                series.isna()
                | series.astype(str).str.strip().str.lower().isin(
                    ["", "nan", "none", "null", "n/a", "na", "<na>", "undefined", "nil"]
                )
            )
            null_count = int(missing_mask.sum())
            null_pct = round((null_count / total_src_rows) * 100.0, 2) if total_src_rows > 0 else 0.0

            non_null_series = series[~missing_mask]
            s_norm_list = [KeyDetectionEngine.normalize_key_value(v) for v in non_null_series]
            s_valid_vals = [v for v in s_norm_list if v is not None]
            source_set = set(s_valid_vals)
            source_unique_count = len(source_set)

            common_set = source_set.intersection(target_set)
            common_count = len(common_set)

            data_overlap = round((common_count / max(1, source_unique_count)) * 100.0, 2)
            match_ratio = round((common_count / max(1, target_unique_count)) * 100.0, 2)

            duplicate_count = len(s_valid_vals) - source_unique_count
            if duplicate_count == 0:
                duplicate_status = "Unique (1:1)"
            else:
                duplicate_status = f"1:N ({duplicate_count} duplicate records)"

            null_quality = max(0.0, 100.0 - null_pct)
            src_unique_pct = round((source_unique_count / max(1, len(s_valid_vals))) * 100.0, 2) if s_valid_vals else 0.0
            conf_calc = (0.40 * match_ratio) + (0.30 * data_overlap) + (0.20 * null_quality) + (0.10 * src_unique_pct)
            confidence = round(min(100.0, max(0.0, conf_calc)), 2)

            # Strict Candidate Key Gate & Validation:
            if null_count > 0:
                validation = "FAIL"
                candidate_status = "REJECTED (Has Nulls)"
                reason = f"Rejected as candidate key because it contains {null_count} null/blank values ({null_pct}%)."
            elif common_count == 0:
                validation = "FAIL"
                candidate_status = "DISQUALIFIED (Zero Overlap)"
                reason = "Zero common values found with target key."
            elif data_overlap < 10.0 and match_ratio < 10.0:
                validation = "FAIL"
                candidate_status = "WEAK OVERLAP (FAIL)"
                reason = f"Insufficient overlap ({match_ratio:.2f}% target coverage, {data_overlap:.2f}% source overlap)."
            else:
                validation = "PASS"
                candidate_status = "STRONG CANDIDATE (PASS)"
                reason = f"{common_count} common values ({match_ratio:.2f}% target coverage, {data_overlap:.2f}% source overlap) with 0.00% nulls."

            item = TargetKeyMatchResult(
                source_column=col,
                target_column=target_column,
                common_values=common_count,
                data_overlap=data_overlap,
                match_ratio=match_ratio,
                null_pct=null_pct,
                null_count=null_count,
                unique_count=source_unique_count,
                duplicate_count=duplicate_count,
                duplicate_status=duplicate_status,
                confidence=confidence,
                validation=validation,
                candidate_status=candidate_status,
                reason=reason,
                source_record_count=total_src_rows,
                target_record_count=target_record_count,
            )
            all_results.append(item)
            if validation == "PASS":
                pass_candidates.append(item)

        # Rank PASS candidates by common_values, match_ratio, data_overlap, confidence
        pass_candidates.sort(
            key=lambda x: (x.common_values, x.match_ratio, x.data_overlap, x.confidence),
            reverse=True
        )
        best_match = pass_candidates[0] if pass_candidates else None

        # Sort all evaluated columns with best/cleanest first
        all_results.sort(
            key=lambda x: (x.validation == "PASS", x.common_values, x.match_ratio, -x.null_count),
            reverse=True
        )

        return TargetDirectedKeyDetectionResponse(
            best_match=best_match,
            all_evaluated_columns=all_results,
            target_column=target_column,
            source_file=source_file_path,
            target_file=target_file_path,
            source_sheet=source_sheet,
            target_sheet=target_sheet,
        )


