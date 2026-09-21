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


def normalize_record_key(name: Any) -> str:
    """
    Normalizes a primary key record value (e.g. Customer Name) using existing
    key normalization logic so case, whitespace, BOM, and delimiter differences
    do not break valid mappings.
    """
    if name is None or pd.isna(name):
        return ""
    clean = clean_col_text(name)
    if clean.strip().lower() in ("", "nan", "none", "null"):
        return ""
    norm = robust_normalize_key(clean)
    return norm.replace(" ", "")


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
        try:
            excel.close()
        except Exception:
            pass
        return df

    raise ValueError(f"Unsupported file format: {ext}")


# ============================================================
# FBDI CUSTOMER-NAME COLUMN DETECTION
# ============================================================

def detect_fbdi_customer_key(
    columns: List[str],
    preferred_key: Optional[str] = None,
    source_df: Optional[pd.DataFrame] = None,
    fbdi_df: Optional[pd.DataFrame] = None,
    source_key: Optional[str] = None
) -> str:
    """
    Find the corresponding customer-name column in the FBDI file dynamically
    from the uploaded FBDI schema + actual data.

    - If FBDI uses Customer Name (or *Customer Name), maps:
      Source: Customer Name -> FBDI: Customer Name
    - If FBDI uses another column such as Party Name (or any other column) containing
      the corresponding customer values, automatically detects and maps:
      Source: Customer Name -> FBDI: Party Name
    - Evaluates the actual data overlap between Source customer key values and FBDI columns,
      ensuring detection is completely dynamic without hardcoding any column names.
    """
    cleaned_columns = [clean_col_text(c) for c in columns]

    # --- 1. DATA-DRIVEN DETECTION (Uploaded Schema + Actual Data) ---
    if fbdi_df is not None and not fbdi_df.empty:
        src_col_name = None
        if source_df is not None and not source_df.empty:
            target_sk = source_key or preferred_key or SOURCE_PRIMARY_KEY
            for c in source_df.columns:
                if keys_match(c, target_sk):
                    src_col_name = c
                    break
            if not src_col_name:
                for c in source_df.columns:
                    norm = robust_normalize_key(c)
                    if "customer" in norm and "name" in norm:
                        src_col_name = c
                        break

            if src_col_name and src_col_name in source_df.columns:
                # Extract non-empty normalized source customer values
                src_values = {
                    normalize_record_key(v)
                    for v in source_df[src_col_name]
                    if normalize_record_key(v)
                }

                if src_values:
                    best_col = None
                    best_score = -1.0

                    for orig, clean in zip(columns, cleaned_columns):
                        if orig not in fbdi_df.columns:
                            continue

                        fbdi_vals = {
                            normalize_record_key(v)
                            for v in fbdi_df[orig]
                            if normalize_record_key(v)
                        }
                        overlap = len(src_values.intersection(fbdi_vals))
                        if overlap == 0:
                            continue

                        norm = robust_normalize_key(clean)
                        # Schema priority signal
                        schema_weight = 0.0
                        if keys_match(clean, target_sk) or keys_match(clean, SOURCE_PRIMARY_KEY):
                            schema_weight = 2.0
                        elif any(k in norm for k in ["customer", "party", "account", "client", "org", "entity"]):
                            schema_weight = 1.0
                        elif "name" in norm:
                            schema_weight = 0.5

                        # Score combines overlap count with schema weight
                        score = overlap + (schema_weight * 0.5)
                        if score > best_score:
                            best_score = score
                            best_col = orig

                    if best_col is not None:
                        return best_col

    # --- 2. DYNAMIC SCHEMA-BASED DETECTION (Fallback or Schema-Only) ---
    # If preferred_key is passed, try matching it first (e.g. *Customer Name matching Customer Name)
    if preferred_key and str(preferred_key).strip():
        for orig, clean in zip(columns, cleaned_columns):
            if keys_match(clean, preferred_key):
                return orig

    # 1. Exact / normalized Customer Name
    for orig, clean in zip(columns, cleaned_columns):
        if keys_match(clean, SOURCE_PRIMARY_KEY):
            return orig

    # 2. Dynamic semantic match for common customer/party/account entity columns
    semantic_patterns = [
        lambda n: "customer" in n and "name" in n,
        lambda n: "party" in n and "name" in n,
        lambda n: "account" in n and "name" in n,
        lambda n: "client" in n and "name" in n,
        lambda n: ("organization" in n or "org" in n) and "name" in n,
        lambda n: "party" in n,
        lambda n: "customer" in n,
        lambda n: "account" in n,
    ]

    for pattern in semantic_patterns:
        for orig, clean in zip(columns, cleaned_columns):
            norm = robust_normalize_key(clean)
            if pattern(norm):
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
    source_df: pd.DataFrame,
    fbdi_df: pd.DataFrame,
    output_path: Optional[Path] = None,
    return_dfs: bool = False,
    source_key: Optional[str] = None,
    fbdi_key: Optional[str] = None,
    column_mappings: Optional[Dict[str, str]] = None
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
    # 3. File information
    # --------------------------------------------------------
    print()
    print("=" * 50)
    print("FILE INFORMATION")
    print("=" * 50)
    print(f"Source rows : {len(source_df)}")
    print(f"FBDI rows   : {len(fbdi_df)}")

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
        # Dynamic detection matching source_key or standard customer key from schema + data
        actual_fbdi_key = detect_fbdi_customer_key(
            list(fbdi_df.columns),
            preferred_key=actual_source_key,
            source_df=source_df,
            fbdi_df=fbdi_df,
            source_key=actual_source_key
        )

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

    # Use any user-edited column mappings
    if column_mappings:
        custom_pairs: List[Tuple[str, str]] = []
        user_mapped_src = set()
        for s_col, f_col in column_mappings.items():
            if s_col in source_df.columns and f_col in fbdi_df.columns:
                if s_col != resolved_source_key:
                    custom_pairs.append((str(s_col), str(f_col)))
                    user_mapped_src.add(s_col)
        for s_col, f_col in compare_pairs:
            if s_col not in user_mapped_src:
                custom_pairs.append((s_col, f_col))
        compare_pairs = custom_pairs

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

    # Clean and normalize record keys dynamically using existing normalization logic
    # so case, whitespace, BOM, and delimiter differences do not break valid mappings
    def _to_join_key(val: Any, prefix: str, idx: int) -> str:
        norm = normalize_record_key(val)
        return norm if norm else f"__{prefix}_EMPTY_{idx}__"

    source_clean["_source_row_num"] = [i + 2 for i in range(len(source_clean))]
    source_clean["_join_key"] = [
        _to_join_key(v, "SRC", i)
        for i, v in enumerate(source_clean[resolved_source_key])
    ]

    fbdi_clean["_fbdi_row_num"] = [i + 2 for i in range(len(fbdi_clean))]
    fbdi_clean["_join_key"] = [
        _to_join_key(v, "FBDI", i)
        for i, v in enumerate(fbdi_clean[resolved_fbdi_key])
    ]

    # Count occurrences in FBDI to know if multiple FBDI records existed for this customer key
    fbdi_counts = fbdi_clean["_join_key"].value_counts().to_dict()
    fbdi_clean["_fbdi_match_count"] = [
        fbdi_counts.get(k, 1) for k in fbdi_clean["_join_key"]
    ]

    # Ensure each matched Source/FBDI pair appears as ONE consolidated record, never duplicated
    fbdi_clean_dedup = fbdi_clean.drop_duplicates(subset=["_join_key"], keep="first")

    merged_df = pd.merge(
        source_clean,
        fbdi_clean_dedup,
        on="_join_key",
        how="left",
        suffixes=("_source", "_fbdi")
    )

    merged_df.drop(columns=["_join_key"], inplace=True)

    # Ensure resolved_source_key column name is preserved if suffixed by pd.merge
    if resolved_source_key not in merged_df.columns:
        src_suffixed = f"{resolved_source_key}_source"
        if src_suffixed in merged_df.columns:
            merged_df[resolved_source_key] = merged_df[src_suffixed]

    # --------------------------------------------------------
    # 9. Validate Records: Fully Mapped | Partially Matched | Fully Unmapped
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
    missing_counts: List[int] = []

    for _, row in merged_df.iterrows():
        fbdi_val = row.get(actual_fbdi_key_col)
        fbdi_key_empty = (
            pd.isna(fbdi_val)
            or str(fbdi_val).strip() in ("", "nan", "None", "NaN", "null")
        )

        # 3. Fully Unmapped = Source record has no corresponding FBDI record
        if fbdi_key_empty:
            statuses.append("Fully Unmapped")
            details.append("No corresponding FBDI record found")
            missing_counts.append(0)
            continue

        # Check mapped/corresponding data
        row_issues: List[str] = []
        for src_col, fbdi_col in compare_pairs:
            src_actual = (
                f"{src_col}_source" if f"{src_col}_source" in merged_df.columns else src_col
            )
            fbdi_actual = (
                f"{fbdi_col}_fbdi" if f"{fbdi_col}_fbdi" in merged_df.columns else fbdi_col
            )

            val_s = row.get(src_actual)
            val_f = row.get(fbdi_actual)

            s_empty = pd.isna(val_s) or str(val_s).strip() in ("", "nan", "None", "NaN", "null")
            f_empty = pd.isna(val_f) or str(val_f).strip() in ("", "nan", "None", "NaN", "null")

            if f_empty and not s_empty:
                row_issues.append(f"{fbdi_col}: missing in FBDI")
            elif not values_match(val_s, val_f):
                str_s = "" if s_empty else str(val_s).strip()
                str_f = "" if f_empty else str(val_f).strip()
                row_issues.append(f"{src_col}: '{str_s}' != '{str_f}'")

        # 1. Fully Mapped = Source record has a corresponding FBDI record and all mapped/corresponding data is available
        # 2. Partially Matched = Source record has a corresponding FBDI record, but some mapped/corresponding data is missing
        if row_issues:
            statuses.append("Partially Matched")
            details.append("; ".join(row_issues))
            missing_counts.append(len(row_issues))
        else:
            statuses.append("Fully Mapped")
            details.append("All mapped data available")
            missing_counts.append(0)

    # Insert validation columns at the beginning of the merged dataframe
    merged_df.insert(0, "Reconciliation_Status", statuses)
    merged_df.insert(1, "Mismatch_Details", details)
    merged_df.insert(2, "Mismatched_Field_Count", missing_counts)

    # Attach key metadata to dataframe attrs
    merged_df.attrs["source_key"] = resolved_source_key
    merged_df.attrs["fbdi_key"] = resolved_fbdi_key
    merged_df.attrs["compare_pairs"] = compare_pairs

    # --------------------------------------------------------
    # 10. Display Summary Metrics
    # --------------------------------------------------------
    fully_mapped_count = statuses.count("Fully Mapped")
    partially_matched_count = statuses.count("Partially Matched")
    fully_unmapped_count = statuses.count("Fully Unmapped")
    total_merged = len(merged_df)

    print()
    print("=" * 50)
    print("MERGE & VALIDATION SUMMARY")
    print("=" * 50)
    print(f"Total Source records : {len(source_df)}")
    print(f"Total FBDI records   : {len(fbdi_df)}")
    print(f"Total Merged records : {total_merged}")
    print()
    print(f"  - Fully Mapped      : {fully_mapped_count:>5} ({fully_mapped_count / max(total_merged, 1) * 100:.1f}%)")
    print(f"  - Partially Matched : {partially_matched_count:>5} ({partially_matched_count / max(total_merged, 1) * 100:.1f}%)")
    print(f"  - Fully Unmapped    : {fully_unmapped_count:>5} ({fully_unmapped_count / max(total_merged, 1) * 100:.1f}%)")

    # Display sample of discrepancies if any
    actual_src_col = (
        resolved_source_key if resolved_source_key in merged_df.columns else f"{resolved_source_key}_source"
    )
    if partially_matched_count > 0:
        print("\nSample Partially Matched records:")
        partial_sample = merged_df[merged_df["Reconciliation_Status"] == "Partially Matched"].head(3)
        for _, r in partial_sample.iterrows():
            print(f"  * {r.get(actual_src_col, r.get(resolved_source_key, ''))} -> {r['Mismatch_Details']}")

    if fully_unmapped_count > 0:
        print("\nSample Fully Unmapped records (Source records not in FBDI):")
        unmapped_sample = merged_df[merged_df["Reconciliation_Status"] == "Fully Unmapped"].head(3)
        for _, r in unmapped_sample.iterrows():
            print(f"  * {r.get(actual_src_col, r.get(resolved_source_key, ''))}")

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
    source_df: pd.DataFrame,
    fbdi_df: pd.DataFrame,
    output_path: Optional[Union[str, Path]] = None,
    source_key: Optional[str] = None,
    fbdi_key: Optional[str] = None,
    column_mappings: Optional[Union[Dict[str, str], str]] = None
) -> Dict[str, Any]:
    """
    Programmatic entry point for API and services.
    Executes merge and returns structured summary metrics, columns, mappings, and records.
    Accepts optional source_key, fbdi_key, and user-edited column_mappings.
    """
    if source_df is None or fbdi_df is None:
        return {"status": "ERROR", "message": "Source or FBDI dataframe is missing"}

    out = Path(output_path) if output_path else Path.cwd() / "merged_source_fbdi.xlsx"

    parsed_mappings: Optional[Dict[str, str]] = None
    if isinstance(column_mappings, str) and column_mappings.strip():
        try:
            import json
            parsed = json.loads(column_mappings)
            if isinstance(parsed, dict):
                parsed_mappings = {str(k): str(v) for k, v in parsed.items()}
            elif isinstance(parsed, list):
                parsed_mappings = {
                    str(item["source_column"]): str(item["fbdi_column"])
                    for item in parsed
                    if isinstance(item, dict) and "source_column" in item and "fbdi_column" in item
                }
        except Exception:
            parsed_mappings = None
    elif isinstance(column_mappings, dict):
        parsed_mappings = {str(k): str(v) for k, v in column_mappings.items()}

    merged_df, source_df, fbdi_df = merge_source_fbdi(
        source_df=source_df,
        fbdi_df=fbdi_df,
        output_path=out,
        return_dfs=True,
        source_key=source_key,
        fbdi_key=fbdi_key,
        column_mappings=parsed_mappings
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
    fully_mapped_count = statuses.count("Fully Mapped")
    partially_matched_count = statuses.count("Partially Matched")
    fully_unmapped_count = statuses.count("Fully Unmapped")

    # Return all classified records from the dataset so category counts and displayed records match exactly
    import json
    all_classified_records = json.loads(merged_df.to_json(orient="records", date_format="iso"))

    compare_pairs = merged_df.attrs.get("compare_pairs", [])
    mappings_list = [
        {"source_column": resolved_source_key, "fbdi_column": resolved_fbdi_key, "is_primary_key": True}
    ]
    seen_mapped = {resolved_source_key}
    for sc, tc in compare_pairs:
        if sc not in seen_mapped:
            mappings_list.append({"source_column": sc, "fbdi_column": tc, "is_primary_key": False})
            seen_mapped.add(sc)

    # Derive friendly file names from available context (no src/fbdi Path objects here)
    source_file_name = source_df.attrs.get("source_file_name", "source_file.xlsx")
    fbdi_file_name = fbdi_df.attrs.get("fbdi_file_name", "fbdi_file.xlsx")

    return {
        "status": "SUCCESS",
        "source_file": source_file_name,
        "fbdi_file": fbdi_file_name,
        "source_key": resolved_source_key,
        "fbdi_key": resolved_fbdi_key,
        "total_source": len(source_df),
        "total_fbdi": len(fbdi_df),
        "total_merged": len(merged_df),
        "fully_mapped_count": fully_mapped_count,
        "partially_matched_count": partially_matched_count,
        "fully_unmapped_count": fully_unmapped_count,
        # Backward-compatibility aliases
        "match_count": fully_mapped_count,
        "mismatch_count": partially_matched_count,
        "missing_count": fully_unmapped_count,
        "missing_columns": missing_columns,
        "source_columns": [str(c) for c in source_df.columns],
        "fbdi_columns": [str(c) for c in fbdi_df.columns],
        "mappings": mappings_list,
        "columns": [str(c) for c in merged_df.columns],
        "records": all_classified_records,
        "output_file": str(out.resolve()),
        "download_url": "/api/v1/source-fbdi/download"
    }


def generate_automatic_mappings(
    source_df: pd.DataFrame,
    fbdi_df: pd.DataFrame,
    source_key: Optional[str] = None,
    fbdi_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Dynamically generates automatic column mappings between uploaded Source and FBDI files:
    - Primary Key: Customer Name -> corresponding FBDI customer key
    - Comparison columns between Source and FBDI
    Returns column lists and mappings for user review and editing in the Mapping section.
    """
    if source_df is None or fbdi_df is None:
        return {"status": "ERROR", "message": "Source or FBDI dataframe is missing"}

    # 1. Resolve source primary key
    target_src_key = source_key.strip() if source_key and str(source_key).strip() else SOURCE_PRIMARY_KEY
    resolved_src_key: Optional[str] = None
    for col in source_df.columns:
        if keys_match(col, target_src_key):
            resolved_src_key = str(col)
            break
    if not resolved_src_key:
        resolved_src_key = str(source_df.columns[0]) if len(source_df.columns) > 0 else SOURCE_PRIMARY_KEY

    # 2. Resolve FBDI primary key
    if fbdi_key and str(fbdi_key).strip():
        target_fbdi_key = str(fbdi_key).strip()
        resolved_fbdi_key = None
        for col in fbdi_df.columns:
            if keys_match(col, target_fbdi_key):
                resolved_fbdi_key = str(col)
                break
        if not resolved_fbdi_key:
            resolved_fbdi_key = target_fbdi_key
    else:
        try:
            resolved_fbdi_key = detect_fbdi_customer_key(
                list(fbdi_df.columns),
                preferred_key=resolved_src_key,
                source_df=source_df,
                fbdi_df=fbdi_df,
                source_key=resolved_src_key
            )
        except Exception:
            resolved_fbdi_key = str(fbdi_df.columns[0]) if len(fbdi_df.columns) > 0 else "*Customer Name"

    # 3. Identify comparison columns
    compare_pairs = identify_comparison_columns(
        source_cols=list(source_df.columns),
        fbdi_cols=list(fbdi_df.columns),
        source_key=resolved_src_key,
        fbdi_key=resolved_fbdi_key
    )

    mappings_list = [
        {"source_column": resolved_src_key, "fbdi_column": resolved_fbdi_key, "is_primary_key": True}
    ]
    seen_mapped = {resolved_src_key}
    for sc, tc in compare_pairs:
        if sc not in seen_mapped:
            mappings_list.append({"source_column": sc, "fbdi_column": tc, "is_primary_key": False})
            seen_mapped.add(sc)

    return {
        "status": "SUCCESS",
        "source_key": resolved_src_key,
        "fbdi_key": resolved_fbdi_key,
        "source_columns": [str(c) for c in source_df.columns],
        "fbdi_columns": [str(c) for c in fbdi_df.columns],
        "mappings": mappings_list
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