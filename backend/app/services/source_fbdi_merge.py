import sys
import os
import re
import argparse
import warnings
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional, Union

import pandas as pd

# Suppress openpyxl warnings
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    module="openpyxl"
)


# ============================================================
# PRIMARY KEY DEFINITIONS & NORMALIZATION HELPERS
# ============================================================

SOURCE_PRIMARY_KEY = "Customer Name"


def clean_col_text(name: Any) -> str:
    """Removes BOM, non-breaking spaces, outer quotes and surrounding whitespace."""
    if name is None:
        return ""
    return (
        str(name)
        .replace("\ufeff", "")
        .replace("\xa0", "")
        .strip()
        .strip("'\"")
    )


def robust_normalize_key(name: Any) -> str:
    """
    Robust column name normalization for key matching:
    - trim whitespace
    - remove BOM / non-breaking spaces and outer quotes
    - strip leading '*' (Oracle FBDI convention)
    - case-insensitive
    - normalize multiple spaces, '_' and '-' into single space
    """
    clean = clean_col_text(name).lstrip("*").strip()
    return re.sub(r"[\s_\-]+", " ", clean).strip().lower()


def keys_match(col_name: Any, target_name: Any) -> bool:
    """
    Checks if col_name matches target_name using robust normalization:
    1. Direct clean match (case-insensitive)
    2. Normalized spaces, '_' and '-'
    3. Compact match ignoring spaces, '_' and '-' (e.g. CustomerName == Customer Name)
    """
    if col_name is None or target_name is None:
        return False

    c_clean = clean_col_text(col_name)
    t_clean = clean_col_text(target_name)

    if c_clean.lower() == t_clean.lower():
        return True

    norm_c = robust_normalize_key(col_name)
    norm_t = robust_normalize_key(target_name)

    if not norm_c or not norm_t:
        return False

    if norm_c == norm_t:
        return True

    if norm_c.replace(" ", "") == norm_t.replace(" ", ""):
        return True

    return False


# ============================================================
# FILE DETECTION
# ============================================================

def auto_detect_files() -> Tuple[Path, Path]:
    """
    Automatically locate Source and FBDI files (.csv/.xls/.xlsx/.xlsm)
    anywhere inside the DF-Recon project.
    """
    script_path = Path(__file__).resolve()
    project_root = script_path.parents[3]  # DF-Recon root directory
    cwd = Path.cwd()

    candidate_dirs = [
        cwd,
        cwd / "backend" / "uploads",
        cwd / "uploads",
        project_root,
        project_root / "backend" / "uploads",
        project_root / "uploads",
        project_root.parent,
        Path.home() / "Downloads",
    ]

    valid_extensions = {".csv", ".xls", ".xlsx", ".xlsm"}
    seen = set()
    found_files: List[Path] = []

    for d in candidate_dirs:
        if not d.exists():
            continue
        try:
            for item in d.iterdir():
                if item.is_file() and item.suffix.lower() in valid_extensions:
                    filename = item.name.lower()
                    if filename.startswith("~") or filename.startswith(".") or filename.startswith("merged_"):
                        continue
                    abs_path = str(item.resolve())
                    if abs_path not in seen:
                        seen.add(abs_path)
                        found_files.append(item)
                elif item.is_dir() and item.name.lower() in ["uploads", "backend", "data"]:
                    for sub in item.iterdir():
                        if sub.is_file() and sub.suffix.lower() in valid_extensions:
                            sub_name = sub.name.lower()
                            if sub_name.startswith("~") or sub_name.startswith(".") or sub_name.startswith("merged_"):
                                continue
                            abs_sub = str(sub.resolve())
                            if abs_sub not in seen:
                                seen.add(abs_sub)
                                found_files.append(sub)
        except Exception:
            continue

    # 1. Detect Source File (filename contains 'source')
    source_candidates = [
        f for f in found_files
        if "source" in f.name.lower() and not f.name.lower().startswith("merged")
    ]

    source_file: Optional[Path] = None
    # Prefer source file with "customer" in name or named "source file.xlsx"
    for f in source_candidates:
        if "customer" in f.name.lower() or f.name.lower() in ["source file.xlsx", "source.xlsx", "source.csv"]:
            source_file = f
            break
    if source_file is None and source_candidates:
        source_file = source_candidates[0]

    # 2. Detect FBDI File (filename contains 'fbdi')
    fbdi_candidates = [
        f for f in found_files
        if "fbdi" in f.name.lower() and not f.name.lower().startswith("merged")
    ]

    fbdi_file: Optional[Path] = None
    if fbdi_candidates:
        # Prefer FBDI file with "customer" in name
        for f in fbdi_candidates:
            if "customer" in f.name.lower():
                fbdi_file = f
                break
        if fbdi_file is None:
            fbdi_file = fbdi_candidates[0]
    else:
        # Fallback if no file has 'fbdi' in filename:
        # Check if any path contains 'fbdi' folder
        for f in found_files:
            if any("fbdi" in part.lower() for part in f.parts) and not f.name.lower().startswith("merged"):
                fbdi_file = f
                break

        # Check for populated FBDI customer template (e.g. UploadCustomersTemplateAiretech 1.xlsm)
        if fbdi_file is None:
            for f in found_files:
                fname = f.name.lower()
                if "upload" in fname and "customer" in fname:
                    fbdi_file = f
                    break

        # Check for fusion or target files
        if fbdi_file is None:
            for f in found_files:
                fname = f.name.lower()
                if "fusion" in fname or "target" in fname:
                    fbdi_file = f
                    break

        # Check other customer templates
        if fbdi_file is None:
            for f in found_files:
                fname = f.name.lower()
                if "template" in fname and "customer" in fname:
                    fbdi_file = f
                    break

    if source_file is None:
        raise FileNotFoundError(
            "Source file was not found automatically.\n"
            "Please place a Source file containing 'source' in its filename inside the project."
        )

    if fbdi_file is None:
        raise FileNotFoundError(
            "FBDI file was not found automatically.\n"
            "Please place an FBDI file containing 'fbdi' in its filename inside the project."
        )

    return source_file, fbdi_file


# ============================================================
# LOAD FILE
# ============================================================

def load_data_file(file_path: Path) -> pd.DataFrame:
    """
    Load CSV, XLS, XLSX or XLSM file into a pandas DataFrame.
    Handles multi-sheet workbooks and header row detection in FBDI templates.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = file_path.suffix.lower()

    if ext == ".csv":
        return pd.read_csv(file_path, low_memory=False)

    elif ext in [".xls", ".xlsx", ".xlsm"]:
        excel = pd.ExcelFile(file_path)
        sheet_name = excel.sheet_names[0]

        # Prioritize data/customer sheets in multi-sheet FBDI workbooks
        for s in excel.sheet_names:
            s_clean = s.lower().replace("_", "").replace(" ", "")
            if any(k in s_clean for k in ["customer", "parties", "party", "data"]):
                if not any(k in s_clean for k in ["instruction", "lov", "use"]):
                    sheet_name = s
                    break

        df = pd.read_excel(excel, sheet_name=sheet_name)

        # Check if header row is shifted (common in Oracle FBDI templates with rows 0-3 as instructions)
        cols = [clean_col_text(c) for c in df.columns]
        unnamed_ratio = sum(1 for c in cols if c.startswith("Unnamed:")) / max(len(cols), 1)
        has_key_col = any(
            keys_match(c, "Customer Name")
            or keys_match(c, "Party Name")
            or ("customer" in robust_normalize_key(c) and "name" in robust_normalize_key(c))
            or ("party" in robust_normalize_key(c) and "name" in robust_normalize_key(c))
            for c in cols
        )

        if unnamed_ratio > 0.4 or not has_key_col:
            raw_sample = pd.read_excel(excel, sheet_name=sheet_name, header=None, nrows=15)
            for idx, row in raw_sample.iterrows():
                row_vals = [clean_col_text(v) for v in row.values if str(v) != "nan"]
                if any(
                    keys_match(v, "Customer Name")
                    or keys_match(v, "Party Name")
                    or ("customer" in robust_normalize_key(v) and "name" in robust_normalize_key(v))
                    or ("party" in robust_normalize_key(v) and "name" in robust_normalize_key(v))
                    for v in row_vals
                ):
                    df = pd.read_excel(excel, sheet_name=sheet_name, header=idx)
                    break

        # Clean column names
        df.columns = [clean_col_text(c) for c in df.columns]
        return df

    raise ValueError(f"Unsupported file format: {ext}")


# ============================================================
# FBDI CUSTOMER-NAME COLUMN DETECTION
# ============================================================

def detect_fbdi_customer_key(columns: List[str], preferred_key: Optional[str] = None) -> str:
    """
    Find the corresponding customer-name column in the FBDI file.
    Matches Customer Name (with or without Oracle FBDI '*' prefix), Party Name, or Account Name.
    If preferred_key is supplied, prioritizes matching it.
    """
    cleaned_columns = [clean_col_text(c) for c in columns]

    # If preferred_key is passed, try matching it first (e.g. *Customer Name matching Customer Name)
    if preferred_key and str(preferred_key).strip():
        for orig, clean in zip(columns, cleaned_columns):
            if keys_match(clean, preferred_key):
                return orig

    # 1. Exact / normalized Customer Name
    for orig, clean in zip(columns, cleaned_columns):
        if keys_match(clean, "Customer Name"):
            return orig

    # 2. Party Name / Party_Name
    for orig, clean in zip(columns, cleaned_columns):
        if keys_match(clean, "Party Name") or ("party" in robust_normalize_key(clean) and "name" in robust_normalize_key(clean)):
            return orig

    # 3. Account Name / Account_Name
    for orig, clean in zip(columns, cleaned_columns):
        if keys_match(clean, "Account Name") or ("account" in robust_normalize_key(clean) and "name" in robust_normalize_key(clean)):
            return orig

    # 4. Contains both "customer" and "name"
    for orig, clean in zip(columns, cleaned_columns):
        norm = robust_normalize_key(clean)
        if "customer" in norm and "name" in norm:
            return orig

    # 5. Contains both "party" and "name"
    for orig, clean in zip(columns, cleaned_columns):
        norm = robust_normalize_key(clean)
        if "party" in norm and "name" in norm:
            return orig

    raise ValueError(
        "Could not find the customer-name column in the FBDI file.\n\n"
        f"Available FBDI columns:\n{cleaned_columns}"
    )


# ============================================================
# COLUMN COMPARISON & VALUE VALIDATION HELPERS
# ============================================================

def normalize_col_name(col: str) -> str:
    """Normalizes column name for fuzzy alignment between Source and FBDI."""
    return (
        str(col)
        .lstrip("*")
        .replace("#", "")
        .replace("_", "")
        .replace(" ", "")
        .replace("-", "")
        .lower()
    )


def identify_comparison_columns(
    source_cols: List[str],
    fbdi_cols: List[str],
    source_key: str,
    fbdi_key: str
) -> List[Tuple[str, str]]:
    """
    Identifies common or mapped columns between Source and FBDI for record comparison.
    Returns list of tuples: (source_column_name, fbdi_column_name).
    """
    # Canonical synonyms for standard ERP migration fields
    synonyms: Dict[str, List[str]] = {
        "city": ["city", "town"],
        "state": ["state", "province", "region"],
        "country": ["country", "countrycode"],
        "postalzip": ["postalcode", "zipcode", "zip", "postal"],
        "postalcode": ["postalzip", "zipcode", "zip", "postal"],
        "address1": ["addressline1", "address1", "streetaddress"],
        "address2": ["addressline2", "address2"],
        "address3": ["addressline3", "address3"],
        "telephone": ["phone", "phonenumber", "telephone", "contactpoint"],
    }

    pairs: List[Tuple[str, str]] = []
    seen_src = set()

    fbdi_norm_map: Dict[str, str] = {
        normalize_col_name(c): c for c in fbdi_cols if c != fbdi_key
    }

    for sc in source_cols:
        if sc == source_key or sc in seen_src:
            continue

        sn = normalize_col_name(sc)

        # 1. Direct normalized match
        if sn in fbdi_norm_map:
            pairs.append((sc, fbdi_norm_map[sn]))
            seen_src.add(sc)
            continue

        # 2. Synonym match
        matched = False
        for syn_key, syn_list in synonyms.items():
            if sn == syn_key or sn in syn_list:
                for target_syn in [syn_key] + syn_list:
                    if target_syn in fbdi_norm_map:
                        pairs.append((sc, fbdi_norm_map[target_syn]))
                        seen_src.add(sc)
                        matched = True
                        break
            if matched:
                break

    return pairs


def values_match(val_src: Any, val_fbdi: Any) -> bool:
    """
    Checks if a Source field value and an FBDI field value match.
    Normalizes whitespace, casing, and handles empty/null equivalence.
    """
    s_empty = pd.isna(val_src) or str(val_src).strip() in ("", "nan", "None", "NaN")
    f_empty = pd.isna(val_fbdi) or str(val_fbdi).strip() in ("", "nan", "None", "NaN")

    if s_empty and f_empty:
        return True
    if s_empty != f_empty:
        return False

    s_str = str(val_src).strip().casefold()
    f_str = str(val_fbdi).strip().casefold()

    if s_str == f_str:
        return True

    # Check numeric equivalence (e.g. 1000 == 1000.0)
    try:
        s_num = float(s_str.replace(",", "").replace("$", ""))
        f_num = float(f_str.replace(",", "").replace("$", ""))
        return abs(s_num - f_num) < 1e-4
    except ValueError:
        pass

    return False


# ============================================================
# MERGE SOURCE + FBDI WITH VALIDATION
# ============================================================

def merge_source_fbdi(
    source_path: Path,
    fbdi_path: Path,
    output_path: Optional[Path] = None,
    return_dfs: bool = False,
    source_key: Optional[str] = None,
    fbdi_key: Optional[str] = None
) -> Union[pd.DataFrame, Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]]:
    """
    Main workflow:
    1. Load Source and FBDI datasets.
    2. Validate Primary Key on Source and FBDI.
    3. Detect unmapped/missing Source columns.
    4. LEFT JOIN Source and FBDI using the Source Primary Key.
    5. Validate records and classify into MATCH, MISMATCH, or MISSING.
    6. Save enriched output to Excel (merged_source_fbdi.xlsx).
    """

    # --------------------------------------------------------
    # 1. Display detected files
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print("DETECTED FILES")
    print("=" * 50)
    print(f"Source file : {source_path.resolve()}")
    print(f"FBDI file   : {fbdi_path.resolve()}")

    # --------------------------------------------------------
    # 2. Load files
    # --------------------------------------------------------
    source_df = load_data_file(source_path)
    fbdi_df = load_data_file(fbdi_path)

    # --------------------------------------------------------
    # 3. File information
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print("FILE INFORMATION")
    print("=" * 50)
    print(f"Source rows : {len(source_df)}")
    print(f"FBDI rows   : {len(fbdi_df)}")
    print(f"Source type : {source_path.suffix.lower()}")
    print(f"FBDI type   : {fbdi_path.suffix.lower()}")

    # --------------------------------------------------------
    # 4. Primary Key Validation
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print("PRIMARY KEY VALIDATION")
    print("=" * 50)

    # 1. Determine Source Primary Key (fallback to SOURCE_PRIMARY_KEY = "Customer Name")
    target_src_key = source_key.strip() if source_key and str(source_key).strip() else SOURCE_PRIMARY_KEY

    actual_source_key: Optional[str] = None
    for column in source_df.columns:
        if keys_match(column, target_src_key):
            actual_source_key = str(column)
            break

    if actual_source_key is None:
        raise ValueError(
            f"Source file does not contain required primary key '{target_src_key}'.\n\n"
            f"Available Source columns:\n{list(source_df.columns)}"
        )

    # 2. Determine FBDI Primary Key
    actual_fbdi_key: Optional[str] = None
    if fbdi_key and str(fbdi_key).strip():
        target_fbdi_key = str(fbdi_key).strip()
        for column in fbdi_df.columns:
            if keys_match(column, target_fbdi_key):
                actual_fbdi_key = str(column)
                break
        if actual_fbdi_key is None:
            raise ValueError(
                f"FBDI file does not contain requested primary key '{target_fbdi_key}'.\n\n"
                f"Available FBDI columns:\n{list(fbdi_df.columns)}"
            )
    else:
        # Dynamic detection matching source_key or standard customer key
        actual_fbdi_key = detect_fbdi_customer_key(list(fbdi_df.columns), preferred_key=actual_source_key)

    resolved_source_key = actual_source_key
    resolved_fbdi_key = actual_fbdi_key

    print(f"Source Primary Key : '{resolved_source_key}' (Reference Dataset)")
    print(f"FBDI Primary Key   : '{resolved_fbdi_key}' (Detected in FBDI)")
    print("Primary key validation successful.")

    # --------------------------------------------------------
    # 5. Display Source and FBDI Columns
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print(f"SOURCE COLUMNS ({len(source_df.columns)})")
    print("=" * 50)
    for col in source_df.columns:
        print(f"  - {col}")

    print()
    print("=" * 50)
    print(f"FBDI COLUMNS ({len(fbdi_df.columns)})")
    print("=" * 50)
    for col in fbdi_df.columns:
        print(f"  - {col}")

    # --------------------------------------------------------
    # 6. Detect Source columns missing/unmapped in FBDI
    # --------------------------------------------------------
    source_columns = [str(c).strip() for c in source_df.columns]
    fbdi_columns_norm = {normalize_col_name(c) for c in fbdi_df.columns}

    missing_columns = [
        col for col in source_columns
        if normalize_col_name(col) not in fbdi_columns_norm
    ]

    print()
    print("=" * 50)
    print(f"SOURCE COLUMNS MISSING / UNMAPPED IN FBDI ({len(missing_columns)})")
    print("=" * 50)
    if missing_columns:
        for col in missing_columns:
            print(f"  - {col}")
    else:
        print("  None (all Source columns mapped in FBDI)")

    # --------------------------------------------------------
    # 7. Identify Comparison Columns for Validation
    # --------------------------------------------------------
    compare_pairs = identify_comparison_columns(
        source_cols=list(source_df.columns),
        fbdi_cols=list(fbdi_df.columns),
        source_key=resolved_source_key,
        fbdi_key=resolved_fbdi_key
    )

    print()
    print("=" * 50)
    print(f"VALIDATION COMPARISON FIELDS ({len(compare_pairs)})")
    print("=" * 50)
    for sc, tc in compare_pairs:
        print(f"  Source['{sc}'] <---> FBDI['{tc}']")

    # --------------------------------------------------------
    # 8. Clean Keys & Perform LEFT JOIN
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print("MERGING FILES (LEFT JOIN ON SOURCE PRIMARY KEY)")
    print("=" * 50)
    print(f"Main / Reference Dataset : Source ({len(source_df)} rows)")
    print(f"Joining on               : Source['{resolved_source_key}'] <--> FBDI['{resolved_fbdi_key}']")

    source_clean = source_df.copy()
    fbdi_clean = fbdi_df.copy()

    # Clean key strings for deterministic join
    source_clean["_join_key"] = source_clean[resolved_source_key].astype(str).str.strip()
    fbdi_clean["_join_key"] = fbdi_clean[resolved_fbdi_key].astype(str).str.strip()

    merged_df = pd.merge(
        source_clean,
        fbdi_clean,
        on="_join_key",
        how="left",
        suffixes=("_source", "_fbdi")
    )

    merged_df.drop(columns=["_join_key"], inplace=True)

    # --------------------------------------------------------
    # 9. Validate Records: MATCH, MISMATCH, or MISSING
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print("RECORD VALIDATION & CLASSIFICATION")
    print("=" * 50)

    # Resolve column names in merged dataframe (handling suffixes)
    actual_fbdi_key_col = (
        f"{resolved_fbdi_key}_fbdi" if f"{resolved_fbdi_key}_fbdi" in merged_df.columns else resolved_fbdi_key
    )

    statuses: List[str] = []
    details: List[str] = []
    mismatch_counts: List[int] = []

    for _, row in merged_df.iterrows():
        fbdi_val = row.get(actual_fbdi_key_col)
        fbdi_key_empty = (
            pd.isna(fbdi_val)
            or str(fbdi_val).strip() in ("", "nan", "None", "NaN")
        )

        # Record has NO matching FBDI record
        if fbdi_key_empty:
            statuses.append("MISSING")
            details.append("No matching record found in FBDI")
            mismatch_counts.append(0)
            continue

        # Check compared fields for differences
        row_diffs: List[str] = []
        for src_col, fbdi_col in compare_pairs:
            src_actual = (
                f"{src_col}_source" if f"{src_col}_source" in merged_df.columns else src_col
            )
            fbdi_actual = (
                f"{fbdi_col}_fbdi" if f"{fbdi_col}_fbdi" in merged_df.columns else fbdi_col
            )

            val_s = row.get(src_actual)
            val_f = row.get(fbdi_actual)

            if not values_match(val_s, val_f):
                str_s = "" if pd.isna(val_s) else str(val_s).strip()
                str_f = "" if pd.isna(val_f) else str(val_f).strip()
                row_diffs.append(f"{src_col}: '{str_s}' != '{str_f}'")

        if row_diffs:
            statuses.append("MISMATCH")
            details.append("; ".join(row_diffs))
            mismatch_counts.append(len(row_diffs))
        else:
            statuses.append("MATCH")
            details.append("")
            mismatch_counts.append(0)

    # Insert validation columns at the beginning of the merged dataframe
    merged_df.insert(0, "Reconciliation_Status", statuses)
    merged_df.insert(1, "Mismatch_Details", details)
    merged_df.insert(2, "Mismatched_Field_Count", mismatch_counts)

    # Attach key metadata to dataframe attrs
    merged_df.attrs["source_key"] = resolved_source_key
    merged_df.attrs["fbdi_key"] = resolved_fbdi_key

    # --------------------------------------------------------
    # 10. Display Summary Metrics
    # --------------------------------------------------------
    match_count = statuses.count("MATCH")
    mismatch_count = statuses.count("MISMATCH")
    missing_count = statuses.count("MISSING")
    total_merged = len(merged_df)

    print()
    print("=" * 50)
    print("MERGE & VALIDATION SUMMARY")
    print("=" * 50)
    print(f"Total Source records : {len(source_df)}")
    print(f"Total FBDI records   : {len(fbdi_df)}")
    print(f"Total Merged records : {total_merged}")
    print()
    print(f"  - MATCH     : {match_count:>5} ({match_count / total_merged * 100:.1f}%)")
    print(f"  - MISMATCH  : {mismatch_count:>5} ({mismatch_count / total_merged * 100:.1f}%)")
    print(f"  - MISSING   : {missing_count:>5} ({missing_count / total_merged * 100:.1f}%)")

    # Display sample of discrepancies if any
    if mismatch_count > 0:
        print("\nSample MISMATCH records:")
        mismatch_sample = merged_df[merged_df["Reconciliation_Status"] == "MISMATCH"].head(3)
        for _, r in mismatch_sample.iterrows():
            print(f"  * {r[resolved_source_key]} -> {r['Mismatch_Details']}")

    if missing_count > 0:
        print("\nSample MISSING records (Source records not in FBDI):")
        missing_sample = merged_df[merged_df["Reconciliation_Status"] == "MISSING"].head(3)
        for _, r in missing_sample.iterrows():
            print(f"  * {r[resolved_source_key]}")

    # --------------------------------------------------------
    # 11. Save Enriched Output
    # --------------------------------------------------------
    if output_path is None:
        output_path = Path.cwd() / "merged_source_fbdi.xlsx"
    else:
        output_path = Path(output_path)

    merged_df.to_excel(output_path, index=False)

    print()
    print("=" * 50)
    print("SUCCESS")
    print("=" * 50)
    print(f"Merged file with validation saved at:\n{output_path.resolve()}\n")

    if return_dfs:
        return merged_df, source_df, fbdi_df

    return merged_df


def run_merge_pipeline(
    source_path: Optional[Union[str, Path]] = None,
    fbdi_path: Optional[Union[str, Path]] = None,
    output_path: Optional[Union[str, Path]] = None,
    source_key: Optional[str] = None,
    fbdi_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Programmatic entry point for API and services.
    Executes merge and returns structured summary metrics, columns, and records.
    Accepts optional source_key and fbdi_key overrides.
    """
    src = Path(source_path) if source_path else None
    fbdi = Path(fbdi_path) if fbdi_path else None

    if src is None or fbdi is None:
        detected_src, detected_fbdi = auto_detect_files()
        src = src or detected_src
        fbdi = fbdi or detected_fbdi

    out = Path(output_path) if output_path else Path.cwd() / "merged_source_fbdi.xlsx"

    merged_df, source_df, fbdi_df = merge_source_fbdi(
        source_path=src,
        fbdi_path=fbdi,
        output_path=out,
        return_dfs=True,
        source_key=source_key,
        fbdi_key=fbdi_key
    )

    resolved_source_key = merged_df.attrs.get("source_key", source_key or SOURCE_PRIMARY_KEY)
    resolved_fbdi_key = merged_df.attrs.get(
        "fbdi_key",
        fbdi_key or detect_fbdi_customer_key(list(fbdi_df.columns), preferred_key=resolved_source_key)
    )

    source_columns = [str(c).strip() for c in source_df.columns]
    fbdi_columns_norm = {normalize_col_name(c) for c in fbdi_df.columns}
    missing_columns = [
        col for col in source_columns
        if normalize_col_name(col) not in fbdi_columns_norm
    ]

    statuses = list(merged_df["Reconciliation_Status"])
    match_count = statuses.count("MATCH")
    mismatch_count = statuses.count("MISMATCH")
    missing_count = statuses.count("MISSING")

    # Limit records sent over JSON to 300 rows for high responsiveness
    sample_df = merged_df.head(300).copy()
    import json
    sample_records = json.loads(sample_df.to_json(orient="records", date_format="iso"))

    return {
        "status": "SUCCESS",
        "source_file": src.name,
        "fbdi_file": fbdi.name,
        "source_key": resolved_source_key,
        "fbdi_key": resolved_fbdi_key,
        "total_source": len(source_df),
        "total_fbdi": len(fbdi_df),
        "total_merged": len(merged_df),
        "match_count": match_count,
        "mismatch_count": mismatch_count,
        "missing_count": missing_count,
        "missing_columns": missing_columns,
        "columns": [str(c) for c in merged_df.columns],
        "records": sample_records,
        "output_file": str(out.resolve()),
        "download_url": "/api/v1/source-fbdi/download"
    }


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Merge Source and FBDI with Validation (MATCH, MISMATCH, MISSING)"
    )
    parser.add_argument(
        "source",
        nargs="?",
        default=None,
        help="Optional path to Source file (.csv, .xls, .xlsx, .xlsm)"
    )
    parser.add_argument(
        "fbdi",
        nargs="?",
        default=None,
        help="Optional path to FBDI file (.csv, .xls, .xlsx, .xlsm)"
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Optional output Excel path (default: merged_source_fbdi.xlsx)"
    )
    parser.add_argument(
        "--source-key",
        default=None,
        help="Optional source primary key column (default: Customer Name)"
    )
    parser.add_argument(
        "--fbdi-key",
        default=None,
        help="Optional FBDI primary key column (default: auto-detected)"
    )

    args = parser.parse_args()

    try:
        print()
        print("=" * 50)
        print("AUTOMATIC SOURCE + FBDI MERGE & VALIDATION")
        print("=" * 50)

        source_path = Path(args.source) if args.source else None
        fbdi_path = Path(args.fbdi) if args.fbdi else None

        # Automatically detect files if not explicitly provided
        if source_path is None or fbdi_path is None:
            detected_source, detected_fbdi = auto_detect_files()
            source_path = source_path or detected_source
            fbdi_path = fbdi_path or detected_fbdi

        merge_source_fbdi(
            source_path=source_path,
            fbdi_path=fbdi_path,
            output_path=Path(args.output) if args.output else None,
            source_key=args.source_key,
            fbdi_key=args.fbdi_key,
        )

    except Exception as error:
        print()
        print(f"[ERROR] {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()