"""
dynamic_table_manager.py — Creates and manages dynamically generated PostgreSQL
tables from uploaded files (Source, Target, FBDI, etc.).

Each file+sheet gets its own properly typed PG table (e.g. data_file_abc_customers).
For multi-sheet files, FK relationships between sibling sheets are auto-detected
and created as DEFERRABLE constraints.

Registry tables:
  - app_dynamic_tables  → tracks which PG tables were created
  - app_dynamic_fks     → tracks FK relationships between them
"""

import io
import re
import json
import uuid
from itertools import combinations
from typing import List, Dict, Any, Optional, Tuple

import pandas as pd
import numpy as np

# Lazy-imported to avoid circular imports at module level
_SKIP_SHEETS = {"lov", "instructions", "readme", "info", "cover", "changelog",
                "summary", "overview", "metadata", "contents", "notes"}

# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

_SANITIZE_RE = re.compile(r"[^a-z0-9_]")
_MULTI_UNDERSCORE = re.compile(r"_{2,}")
_PK_TERMS = {"id", "key", "num", "number", "code", "ref", "reference", "no"}


def _sanitize_identifier(name: str, max_len: int = 63) -> str:
    """Convert an arbitrary string into a safe PG identifier."""
    s = name.lower().strip().lstrip("*").strip()
    s = s.replace(" ", "_").replace("-", "_")
    s = _SANITIZE_RE.sub("", s)
    s = _MULTI_UNDERSCORE.sub("_", s).strip("_")
    return s[:max_len] if s else "unnamed"


def _is_pk_candidate(col_name: str) -> bool:
    """Heuristic: does this column name look like a primary/foreign key?"""
    tokens = set(_sanitize_identifier(col_name).split("_"))
    return bool(tokens & _PK_TERMS)


def _normalize_col_for_fk(col: str) -> str:
    """Normalize a column name for FK matching across sheets."""
    return _sanitize_identifier(col.lstrip("*").strip())


# ────────────────────────────────────────────────────────────────────────────────
# Type inference
# ────────────────────────────────────────────────────────────────────────────────

def _infer_pg_type(series: pd.Series) -> str:
    """Infer the best PostgreSQL column type from a pandas Series."""
    sample = series.dropna()
    if sample.empty:
        return "TEXT"

    # Check native pandas dtype first
    if pd.api.types.is_bool_dtype(series):
        return "BOOLEAN"
    if pd.api.types.is_integer_dtype(series):
        return "BIGINT"
    if pd.api.types.is_float_dtype(series):
        return "DOUBLE PRECISION"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "TIMESTAMP"

    # For object columns, try parsing a sample (up to 500 values)
    sample = sample.head(500)
    n = len(sample)
    if n == 0:
        return "TEXT"

    # Try numeric
    numeric_parsed = pd.to_numeric(sample, errors="coerce")
    numeric_hit = numeric_parsed.notna().sum()
    if numeric_hit / n > 0.8:
        # All parseable values are integers?
        non_null = numeric_parsed.dropna()
        if len(non_null) > 0 and (non_null % 1 == 0).all():
            return "BIGINT"
        return "DOUBLE PRECISION"

    # Try date
    try:
        date_parsed = pd.to_datetime(sample, errors="coerce", infer_datetime_format=True)
        date_hit = date_parsed.notna().sum()
        if date_hit / n > 0.8:
            return "TIMESTAMP"
    except Exception:
        pass

    # Try boolean-ish
    bool_vals = {"true", "false", "yes", "no", "1", "0", "y", "n", "t", "f"}
    str_vals = sample.astype(str).str.strip().str.lower()
    if str_vals.isin(bool_vals).sum() / n > 0.9:
        return "BOOLEAN"

    return "TEXT"


def _cast_value(val: Any, pg_type: str) -> Any:
    """Cast a Python value to match the target PG type, returning None for NaN."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    if pd.isna(val):
        return None

    if pg_type == "BIGINT":
        try:
            f = float(val)
            return int(f) if not np.isnan(f) else None
        except (ValueError, TypeError):
            return None
    elif pg_type == "DOUBLE PRECISION":
        try:
            f = float(val)
            return f if not np.isnan(f) else None
        except (ValueError, TypeError):
            return None
    elif pg_type == "BOOLEAN":
        s = str(val).strip().lower()
        if s in ("true", "yes", "1", "y", "t"):
            return True
        if s in ("false", "no", "0", "n", "f"):
            return False
        return None
    elif pg_type == "TIMESTAMP":
        try:
            return pd.Timestamp(val).to_pydatetime()
        except Exception:
            return str(val)
    else:
        return str(val) if val is not None else None


# ────────────────────────────────────────────────────────────────────────────────
# Main service
# ────────────────────────────────────────────────────────────────────────────────

class DynamicTableManager:
    """Creates and manages dynamically generated PostgreSQL tables from uploaded files."""

    # ── Public API ────────────────────────────────────────────────────────────

    @staticmethod
    def ingest_file(
        file_id: str,
        file_role: str,
        batch_id: str,
        project_id: str,
        content: bytes,
        file_name: str,
        conn,
    ) -> List[Dict[str, Any]]:
        """
        Main entry point.  Parses ALL sheets from the uploaded file, creates
        one PG table per sheet, inserts data with proper types, detects FK
        relationships between sibling sheets, and registers everything in the
        app_dynamic_tables / app_dynamic_fks registry.

        Returns a list of table-metadata dicts (one per sheet).
        """
        # 1. Clean up any previously created tables for this file
        DynamicTableManager.drop_tables_for_file(file_id, conn)

        # 2. Parse sheets from the file
        sheets = DynamicTableManager._parse_all_sheets(content, file_name)
        if not sheets:
            return []

        table_metas: List[Dict[str, Any]] = []

        # 3. For each sheet, create a table + insert data
        for sheet in sheets:
            sheet_name = sheet["name"]
            df = sheet["df"]
            if df is None or df.empty:
                continue

            # Build column definitions
            col_defs = DynamicTableManager._build_column_defs(df)
            if not col_defs:
                continue

            # Generate table name
            pg_table = DynamicTableManager._make_table_name(file_id, sheet_name)

            # Create the table
            DynamicTableManager._create_table(pg_table, col_defs, conn)

            # Insert rows
            row_count = DynamicTableManager._insert_rows(pg_table, col_defs, df, conn)

            # Register in metadata
            meta_id = f"dtbl_{uuid.uuid4().hex[:8]}"
            columns_json = json.dumps([
                {
                    "name": c["name"],
                    "pg_name": c["pg_name"],
                    "pg_type": c["pg_type"],
                    "nullable": c["nullable"],
                    "is_pk_candidate": c["is_pk_candidate"],
                }
                for c in col_defs
            ])

            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO app_dynamic_tables
                    (id, file_id, file_role, batch_id, project_id,
                     sheet_name, pg_table_name, row_count, column_count, columns_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    meta_id, file_id, file_role.lower(), batch_id or None,
                    project_id or None, sheet_name, pg_table, row_count,
                    len(col_defs), columns_json,
                ),
            )
            cur.close()

            table_metas.append({
                "id": meta_id,
                "file_id": file_id,
                "sheet_name": sheet_name,
                "pg_table_name": pg_table,
                "row_count": row_count,
                "column_count": len(col_defs),
                "columns": [
                    {"name": c["name"], "pg_name": c["pg_name"],
                     "pg_type": c["pg_type"], "is_pk_candidate": c["is_pk_candidate"]}
                    for c in col_defs
                ],
            })

        # 4. Detect FK relationships between sibling tables
        fk_metas = DynamicTableManager._detect_and_create_fks(table_metas, conn)

        # 5. Commit everything
        conn.commit()

        # Attach FK info to table_metas for response
        for tm in table_metas:
            tm["foreign_keys"] = [
                fk for fk in fk_metas
                if fk["child_table_id"] == tm["id"] or fk["parent_table_id"] == tm["id"]
            ]

        return table_metas

    @staticmethod
    def drop_tables_for_file(file_id: str, conn) -> None:
        """DROP all dynamic tables associated with a file_id and remove registry entries."""
        cur = conn.cursor()
        # Get table names before deleting metadata
        cur.execute(
            "SELECT pg_table_name FROM app_dynamic_tables WHERE file_id = %s",
            (file_id,),
        )
        table_names = [row[0] for row in cur.fetchall()]

        # Delete FK entries (cascaded via ON DELETE CASCADE on app_dynamic_tables)
        # Delete registry entries
        cur.execute("DELETE FROM app_dynamic_tables WHERE file_id = %s", (file_id,))

        # Drop actual PG tables
        for tbl in table_names:
            safe = DynamicTableManager._validate_table_name(tbl)
            if safe:
                cur.execute(f'DROP TABLE IF EXISTS "{safe}" CASCADE')

        cur.close()
        conn.commit()

    @staticmethod
    def get_tables_for_file(file_id: str, conn) -> List[Dict[str, Any]]:
        """Return metadata for all dynamic tables created from a given file."""
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT id, file_id, file_role, batch_id, project_id,
                   sheet_name, pg_table_name, row_count, column_count, columns_json, created_at
            FROM app_dynamic_tables
            WHERE file_id = %s
            ORDER BY created_at
            """,
            (file_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()

        # Attach FK info
        if rows:
            table_ids = [r["id"] for r in rows]
            fk_cur = conn.cursor(cursor_factory=RealDictCursor)
            fk_cur.execute(
                """
                SELECT id, parent_table_id, child_table_id, parent_column,
                       child_column, match_rate, constraint_name
                FROM app_dynamic_fks
                WHERE parent_table_id = ANY(%s) OR child_table_id = ANY(%s)
                """,
                (table_ids, table_ids),
            )
            fks = [dict(r) for r in fk_cur.fetchall()]
            fk_cur.close()
            for r in rows:
                r["foreign_keys"] = [
                    fk for fk in fks
                    if fk["parent_table_id"] == r["id"] or fk["child_table_id"] == r["id"]
                ]
                # Serialize columns_json and created_at for JSON response
                if r.get("created_at"):
                    r["created_at"] = r["created_at"].isoformat()
        return rows

    @staticmethod
    def get_table_data(
        pg_table_name: str, conn, limit: int = 1000, offset: int = 0
    ) -> Dict[str, Any]:
        """SELECT * from a dynamic table with pagination."""
        safe = DynamicTableManager._validate_table_name(pg_table_name)
        if not safe:
            return {"error": "Invalid table name", "columns": [], "rows": [], "total": 0}

        cur = conn.cursor()
        # Get total count
        cur.execute(f'SELECT COUNT(*) FROM "{safe}"')
        total = cur.fetchone()[0]

        # Get columns
        cur.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s
            ORDER BY ordinal_position
            """,
            (safe,),
        )
        col_info = cur.fetchall()
        columns = [{"name": c[0], "data_type": c[1]} for c in col_info]

        # Get data
        cur.execute(
            f'SELECT * FROM "{safe}" ORDER BY _row_number LIMIT %s OFFSET %s',
            (limit, offset),
        )
        col_names = [desc[0] for desc in cur.description]
        rows = []
        for row in cur.fetchall():
            row_dict = {}
            for i, val in enumerate(row):
                if isinstance(val, (pd.Timestamp,)):
                    row_dict[col_names[i]] = val.isoformat()
                elif val is not None:
                    row_dict[col_names[i]] = val
                else:
                    row_dict[col_names[i]] = None
            rows.append(row_dict)

        cur.close()
        return {"columns": columns, "rows": rows, "total": total,
                "limit": limit, "offset": offset}

    @staticmethod
    def get_relationships_for_file(file_id: str, conn) -> List[Dict[str, Any]]:
        """Get all FK relationships between dynamic tables of a given file."""
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT fk.id, fk.parent_column, fk.child_column, fk.match_rate,
                   fk.constraint_name,
                   pt.pg_table_name AS parent_table, pt.sheet_name AS parent_sheet,
                   ct.pg_table_name AS child_table, ct.sheet_name AS child_sheet
            FROM app_dynamic_fks fk
            JOIN app_dynamic_tables pt ON pt.id = fk.parent_table_id
            JOIN app_dynamic_tables ct ON ct.id = fk.child_table_id
            WHERE pt.file_id = %s OR ct.file_id = %s
            """,
            (file_id, file_id),
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return rows

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _parse_all_sheets(
        content: bytes, file_name: str
    ) -> List[Dict[str, Any]]:
        """Parse all data sheets from a file (Excel multi-sheet, CSV single)."""
        from app.services.file_detector import FileDetectorService

        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        sheets: List[Dict[str, Any]] = []

        try:
            if ext in ("xlsx", "xls", "xlsm"):
                engine = "openpyxl" if ext in ("xlsx", "xlsm") else "xlrd"
                with pd.ExcelFile(io.BytesIO(content), engine=engine) as excel:
                    for sname in excel.sheet_names:
                        if sname.lower().strip() in _SKIP_SHEETS:
                            continue
                        try:
                            df = FileDetectorService.load_excel_sheet(excel, sname)
                            if df is not None and not df.empty:
                                sheets.append({"name": sname, "df": df})
                        except Exception as e:
                            print(f"Warning: could not parse sheet '{sname}': {e}")
            elif ext in ("csv", "txt", "dat"):
                df = pd.read_csv(io.BytesIO(content), low_memory=False)
                if df is not None and not df.empty:
                    sheets.append({"name": "Main", "df": df})
            elif ext == "json":
                df = pd.read_json(io.BytesIO(content))
                if df is not None and not df.empty:
                    sheets.append({"name": "JSON_Root", "df": df})
            elif ext == "zip":
                import zipfile
                import os
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    for zinfo in z.infolist():
                        if zinfo.filename.lower().endswith(".csv") and not zinfo.filename.startswith("__MACOSX"):
                            with z.open(zinfo) as f:
                                try:
                                    df = pd.read_csv(f, low_memory=False)
                                    if df is not None and not df.empty:
                                        sheet_name = os.path.basename(zinfo.filename).rsplit(".", 1)[0]
                                        sheets.append({"name": sheet_name, "df": df})
                                except Exception as e:
                                    print(f"Warning: could not parse csv from zip '{zinfo.filename}': {e}")
        except Exception as e:
            print(f"DynamicTableManager: failed to parse '{file_name}': {e}")

        return sheets

    @staticmethod
    def _build_column_defs(df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Build column definitions with inferred PG types from a DataFrame."""
        col_defs = []
        used_pg_names: set = set()

        for col in df.columns:
            col_str = str(col).strip()
            if not col_str:
                continue

            pg_name = _sanitize_identifier(col_str)
            # Ensure uniqueness
            base = pg_name
            suffix = 2
            while pg_name in used_pg_names:
                pg_name = f"{base}_{suffix}"
                suffix += 1
            used_pg_names.add(pg_name)

            pg_type = _infer_pg_type(df[col])
            null_count = int(df[col].isna().sum())
            nullable = True # Always allow nulls for dynamic ingested tables to avoid strict constraint failures

            col_defs.append({
                "name": col_str,
                "pg_name": pg_name,
                "pg_type": pg_type,
                "nullable": nullable,
                "is_pk_candidate": _is_pk_candidate(col_str),
            })

        return col_defs

    @staticmethod
    def _make_table_name(file_id: str, sheet_name: str) -> str:
        """Generate a safe, unique PG table name."""
        fid = _sanitize_identifier(file_id, max_len=20)
        sname = _sanitize_identifier(sheet_name, max_len=35)
        return f"data_{fid}_{sname}"

    @staticmethod
    def _validate_table_name(name: str) -> Optional[str]:
        """Validate a table name to prevent SQL injection. Returns sanitized name or None."""
        if not name or not name.startswith("data_"):
            return None
        if not re.match(r"^[a-z0-9_]+$", name):
            return None
        if len(name) > 63:
            return None
        return name

    @staticmethod
    def _create_table(pg_table: str, col_defs: List[Dict], conn) -> None:
        """Execute CREATE TABLE with proper column definitions."""
        col_clauses = ["_row_id SERIAL PRIMARY KEY", "_row_number INT NOT NULL"]
        for c in col_defs:
            null_clause = "" if c["nullable"] else " NOT NULL"
            col_clauses.append(f'"{c["pg_name"]}" {c["pg_type"]}{null_clause}')

        sql = f'CREATE TABLE IF NOT EXISTS "{pg_table}" (\n  ' + ",\n  ".join(col_clauses) + "\n)"
        cur = conn.cursor()
        cur.execute(sql)
        cur.close()

    @staticmethod
    def _insert_rows(
        pg_table: str, col_defs: List[Dict], df: pd.DataFrame, conn
    ) -> int:
        """Bulk INSERT rows using execute_values for performance."""
        from psycopg2.extras import execute_values

        pg_col_names = [c["pg_name"] for c in col_defs]
        original_names = [c["name"] for c in col_defs]
        pg_types = [c["pg_type"] for c in col_defs]

        col_list = ", ".join(['"_row_number"'] + [f'"{n}"' for n in pg_col_names])
        sql = f'INSERT INTO "{pg_table}" ({col_list}) VALUES %s'

        rows = []
        for idx, row in enumerate(df[original_names].itertuples(index=False, name=None)):
            values = [idx + 1]  # _row_number
            for val, pg_type in zip(row, pg_types):
                values.append(_cast_value(val, pg_type))
            rows.append(tuple(values))

        if rows:
            cur = conn.cursor()
            execute_values(cur, sql, rows, page_size=1000)
            cur.close()

        return len(rows)

    @staticmethod
    def _detect_and_create_fks(
        table_metas: List[Dict[str, Any]], conn
    ) -> List[Dict[str, Any]]:
        """
        Cross-check columns between sibling tables (same file).
        If column names match and value overlap >= 80%, create FK constraint.
        """
        if len(table_metas) < 2:
            return []

        fk_results: List[Dict[str, Any]] = []
        cur = conn.cursor()

        for t1, t2 in combinations(table_metas, 2):
            cols_1 = {_normalize_col_for_fk(c["name"]): c for c in t1["columns"]}
            cols_2 = {_normalize_col_for_fk(c["name"]): c for c in t2["columns"]}

            shared_keys = set(cols_1.keys()) & set(cols_2.keys())
            # Only consider PK-candidate columns for FK detection
            shared_keys = {
                k for k in shared_keys
                if cols_1[k].get("is_pk_candidate") or cols_2[k].get("is_pk_candidate")
            }

            for key in shared_keys:
                c1 = cols_1[key]
                c2 = cols_2[key]

                # Get distinct values from each table
                try:
                    cur.execute(
                        f'SELECT COUNT(DISTINCT "{c1["pg_name"]}") FROM "{t1["pg_table_name"]}" WHERE "{c1["pg_name"]}" IS NOT NULL'
                    )
                    uniq_1 = cur.fetchone()[0]

                    cur.execute(
                        f'SELECT COUNT(DISTINCT "{c2["pg_name"]}") FROM "{t2["pg_table_name"]}" WHERE "{c2["pg_name"]}" IS NOT NULL'
                    )
                    uniq_2 = cur.fetchone()[0]

                    if uniq_1 == 0 or uniq_2 == 0:
                        continue

                    # Determine parent (fewer uniques) vs child (more rows/uniques)
                    if uniq_1 <= uniq_2:
                        parent_meta, child_meta = t1, t2
                        parent_col, child_col = c1, c2
                    else:
                        parent_meta, child_meta = t2, t1
                        parent_col, child_col = c2, c1

                    # Check overlap: how many child values exist in parent?
                    cur.execute(f"""
                        SELECT COUNT(DISTINCT c."{child_col["pg_name"]}")
                        FROM "{child_meta["pg_table_name"]}" c
                        WHERE c."{child_col["pg_name"]}" IS NOT NULL
                          AND c."{child_col["pg_name"]}"::text IN (
                              SELECT p."{parent_col["pg_name"]}"::text
                              FROM "{parent_meta["pg_table_name"]}" p
                              WHERE p."{parent_col["pg_name"]}" IS NOT NULL
                          )
                    """)
                    overlap_count = cur.fetchone()[0]

                    cur.execute(
                        f'SELECT COUNT(DISTINCT "{child_col["pg_name"]}") FROM "{child_meta["pg_table_name"]}" WHERE "{child_col["pg_name"]}" IS NOT NULL'
                    )
                    child_uniq = cur.fetchone()[0]

                    match_rate = overlap_count / max(1, child_uniq)

                    if match_rate < 0.8:
                        continue

                    # Create FK constraint (DEFERRABLE so bulk inserts work)
                    constraint_name = f"fk_{uuid.uuid4().hex[:8]}"
                    try:
                        # Need a UNIQUE constraint on the parent column first
                        parent_unique_name = f"uq_{uuid.uuid4().hex[:8]}"
                        cur.execute(f"""
                            DO $$
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM pg_constraint
                                    WHERE conrelid = '"{parent_meta["pg_table_name"]}"'::regclass
                                      AND contype = 'u'
                                      AND array_length(conkey, 1) = 1
                                      AND conkey[1] = (
                                          SELECT attnum FROM pg_attribute
                                          WHERE attrelid = '"{parent_meta["pg_table_name"]}"'::regclass
                                            AND attname = '{parent_col["pg_name"]}'
                                      )
                                ) THEN
                                    ALTER TABLE "{parent_meta["pg_table_name"]}"
                                        ADD CONSTRAINT "{parent_unique_name}"
                                        UNIQUE ("{parent_col["pg_name"]}");
                                END IF;
                            EXCEPTION WHEN OTHERS THEN
                                NULL;
                            END $$;
                        """)
                    except Exception:
                        # UNIQUE constraint might fail if there are duplicates — skip FK
                        continue

                    try:
                        cur.execute("SAVEPOINT fk_savepoint")
                        cur.execute(f"""
                            ALTER TABLE "{child_meta["pg_table_name"]}"
                                ADD CONSTRAINT "{constraint_name}"
                                FOREIGN KEY ("{child_col["pg_name"]}")
                                REFERENCES "{parent_meta["pg_table_name"]}" ("{parent_col["pg_name"]}")
                                DEFERRABLE INITIALLY DEFERRED
                        """)
                        cur.execute("RELEASE SAVEPOINT fk_savepoint")
                    except Exception as fk_err:
                        cur.execute("ROLLBACK TO SAVEPOINT fk_savepoint")
                        print(f"FK creation skipped ({constraint_name}): {fk_err}")
                        continue

                    # Register in app_dynamic_fks
                    fk_id = f"dfk_{uuid.uuid4().hex[:8]}"
                    cur.execute(
                        """
                        INSERT INTO app_dynamic_fks
                            (id, parent_table_id, child_table_id, parent_column,
                             child_column, match_rate, constraint_name)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            fk_id, parent_meta["id"], child_meta["id"],
                            parent_col["pg_name"], child_col["pg_name"],
                            round(match_rate, 4), constraint_name,
                        ),
                    )

                    fk_results.append({
                        "id": fk_id,
                        "parent_table_id": parent_meta["id"],
                        "child_table_id": child_meta["id"],
                        "parent_column": parent_col["pg_name"],
                        "child_column": child_col["pg_name"],
                        "match_rate": round(match_rate, 4),
                        "constraint_name": constraint_name,
                    })

                except Exception as e:
                    print(f"FK detection error for key '{key}': {e}")
                    continue

        cur.close()
        return fk_results
