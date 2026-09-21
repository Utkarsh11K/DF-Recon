import os
import zipfile
import json
import io
import xml.etree.ElementTree as ET
import pandas as pd
from typing import List, Tuple, Optional, Dict, Any
from app.schemas.validation_schema import FileDetectionResult, SheetDetectionResult

SUPPORTED_EXTENSIONS = {'.xlsx', '.xls', '.xlsm', '.csv', '.txt', '.dat', '.zip', '.json', '.xml'}

class FileDetectorService:
    @staticmethod
    def is_supported_file(file_path: str) -> bool:
        ext = os.path.splitext(file_path)[1].lower()
        return ext in SUPPORTED_EXTENSIONS

    @staticmethod
    def detect_file_and_sheets(file_source: Any, file_type: str = "SOURCE", file_name: Optional[str] = None) -> FileDetectionResult:
        if isinstance(file_source, str):
            f_name = file_name or os.path.basename(file_source)
            ext = os.path.splitext(f_name)[1].lower()
            file_size = os.path.getsize(file_source) if os.path.exists(file_source) else 0
            f_path = file_source
        elif isinstance(file_source, bytes):
            f_name = file_name or "file"
            ext = os.path.splitext(f_name)[1].lower()
            file_size = len(file_source)
            f_path = f_name
            file_source = io.BytesIO(file_source)
        elif isinstance(file_source, io.BytesIO):
            f_name = file_name or "file"
            ext = os.path.splitext(f_name)[1].lower()
            file_source.seek(0, io.SEEK_END)
            file_size = file_source.tell()
            file_source.seek(0)
            f_path = f_name
        else:
            f_name = file_name or "file"
            ext = os.path.splitext(f_name)[1].lower()
            file_size = 0
            f_path = f_name

        is_supported = ext in SUPPORTED_EXTENSIONS

        result = FileDetectionResult(
            file_name=f_name,
            file_path=f_path,
            file_extension=ext,
            file_size_bytes=file_size,
            is_supported=is_supported,
            file_type=file_type,
            sheets=[],
            inner_files=[]
        )

        if not is_supported or file_size == 0:
            return result

        try:
            if ext in ['.xlsx', '.xls', '.xlsm']:
                FileDetectorService._detect_excel_sheets(file_source, ext, result)
            elif ext in ['.csv', '.txt', '.dat']:
                FileDetectorService._detect_delimited_file(file_source, result)
            elif ext == '.zip' and isinstance(file_source, str):
                FileDetectorService._detect_zip_contents(file_source, result)
            elif ext == '.json' and isinstance(file_source, str):
                FileDetectorService._detect_json_file(file_source, result)
            elif ext == '.xml' and isinstance(file_source, str):
                FileDetectorService._detect_xml_file(file_source, result)
        except Exception as e:
            # If parsing fails during detection, record error state gracefully
            pass

        return result

    @staticmethod
    def _detect_excel_sheets(file_source: Any, ext: str, result: FileDetectionResult):
        engine = 'openpyxl' if ext in ['.xlsx', '.xlsm'] else 'xlrd'
        with pd.ExcelFile(file_source, engine=engine) as excel_file:
            sheet_names = excel_file.sheet_names
            result.sheet_count = len(sheet_names)

            for sheet in sheet_names:
                df = FileDetectorService.load_excel_sheet(excel_file, sheet)
                cols = [str(c) for c in df.columns.tolist()]
                
                # Sanitize sample rows to avoid NaN floats breaking JSON serialization
                sample_df = df.head(5).fillna('')
                sample_rows = sample_df.to_dict(orient='records')
                cleaned_samples = []
                for row in sample_rows:
                    cleaned_samples.append({str(k): ("" if pd.isna(v) else v) for k, v in row.items()})

                sheet_res = SheetDetectionResult(
                    sheet_name=sheet,
                    record_count=len(df),
                    column_count=len(cols),
                    columns=cols,
                    sample_data=cleaned_samples
                )
                result.sheets.append(sheet_res)

            # Rank/sort sheets by data density & sheet structure (record count * column count)
            # so the primary source sheet with highest data size/rows is placed at index 0.
            def calculate_sheet_score(s: SheetDetectionResult) -> float:
                name_low = s.sheet_name.lower()
                multiplier = 1.0
                if any(k in name_low for k in ["instruction", "readme", "summary", "metadata", "note", "cover", "contents", "changelog", "info"]):
                    multiplier = 0.05
                elif any(k in name_low for k in ["data", "source", "extract", "detail", "line", "header", "order", "cust", "emp", "item", "trans", "master", "table"]):
                    multiplier = 1.5
                return (s.record_count * max(1, s.column_count)) * multiplier

            result.sheets.sort(key=calculate_sheet_score, reverse=True)

            # Filter out completely empty sheets (0 rows or 0 columns) if valid data sheets exist
            non_empty = [s for s in result.sheets if s.record_count > 0 or s.column_count > 0]
            if non_empty:
                result.sheets = non_empty
            result.sheet_count = len(result.sheets)

    @staticmethod
    def load_excel_sheet(excel_file: pd.ExcelFile, sheet_name: str) -> pd.DataFrame:
        raw = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, dtype=str)   # whole sheet, no nrows cap
        if raw.empty:
            return raw

        banner = ["do not delete", "instruction", "control information", "readme",
                  "overview", "disclaimer", "note:", "help text", "template"]
        best, header_idx = -1, 0
        for r in range(min(10, len(raw))):                       # only SCAN the first 10 rows
            row = raw.iloc[r].tolist()
            text = " ".join(str(v).lower() for v in row if pd.notna(v))
            if any(k in text for k in banner):
                continue
            sc = FileDetectorService._header_row_score(row)
            if sc > best:
                best, header_idx = sc, r

        header = raw.iloc[header_idx].tolist()
        cols, used = [], set()
        for i, v in enumerate(header):
            name = FileDetectorService._clean_header_value(v) or f"Column {i + 1}"
            base, k = name, 2
            while name in used:
                name, k = f"{base} {k}", k + 1
            used.add(name)
            cols.append(name)

        data = raw.iloc[header_idx + 1:].copy()
        data.columns = cols
        data = data.dropna(axis=0, how="all")
        data["__original_row_number"] = data.index + 1
        return data.reset_index(drop=True)

    @staticmethod
    def _clean_header_value(value: Any) -> str:
        if value is None or pd.isna(value):
            return ''
        name = str(value).strip()
        return '' if not name or name.lower().startswith('unnamed:') else name

    @staticmethod
    def _header_score(name: str) -> tuple[int, int, int]:
        if not name:
            return (0, 0, 0)
        lowered = name.lower()
        parsed_date = pd.to_datetime(name, errors='coerce')
        parsed_number = pd.to_numeric(name, errors='coerce')
        is_date_or_number = not pd.isna(parsed_date) or not pd.isna(parsed_number)
        if is_date_or_number:
            return (0, 0, 0)
        words = [word for word in lowered.replace('/', ' ').replace('-', ' ').split() if word]
        return (2, len(words), len(name))

    @staticmethod
    def _header_row_score(row: list[Any]) -> int:
        header_terms = {
            'type', 'date', 'num', 'name', 'status', 'amount', 'balance',
            'customer', 'account', 'transaction', 'document', 'currency',
            'description', 'number', 'source', 'class', 'complete',
            'address', 'due', 'open', 'payment', 'branch', 'department',
        }
        score = 0
        for value in row:
            name = FileDetectorService._clean_header_value(value).lower()
            if not name:
                continue
            parsed_date = pd.to_datetime(name, errors='coerce')
            parsed_number = pd.to_numeric(name, errors='coerce')
            if not pd.isna(parsed_date) or not pd.isna(parsed_number):
                continue
            words = name.replace('/', ' ').replace('-', ' ').split()
            score += 1 + sum(2 for word in words if word in header_terms)
        return score

    @staticmethod
    def _choose_header_name(first_name: str, second_name: str, index: int) -> str:
        if not first_name and not second_name:
            return f'Column {index + 1}'
        if not first_name:
            return second_name
        if not second_name:
            return first_name
        first_score = FileDetectorService._header_score(first_name)
        second_score = FileDetectorService._header_score(second_name)
        return first_name if first_score >= second_score else second_name

    @staticmethod
    def _detect_delimited_file(file_path: str, result: FileDetectionResult):
        # Auto-detect delimiter and encoding
        delimiter, encoding = FileDetectorService._guess_delimiter_and_encoding(file_path)
        result.delimiter = delimiter
        result.encoding = encoding

        try:
            df = pd.read_csv(file_path, sep=delimiter, encoding=encoding, low_memory=False)
            cols = [str(c) for c in df.columns.tolist()]
            sample_df = df.head(5).fillna('')
            sample_rows = sample_df.to_dict(orient='records')
            cleaned_samples = []
            for row in sample_rows:
                cleaned_samples.append({str(k): ("" if pd.isna(v) else v) for k, v in row.items()})

            result.sheet_count = 1
            result.sheets.append(SheetDetectionResult(
                sheet_name="Main",
                record_count=len(df),
                column_count=len(cols),
                columns=cols,
                sample_data=cleaned_samples
            ))
        except Exception:
            pass

    @staticmethod
    def _guess_delimiter_and_encoding(file_path: str) -> Tuple[str, str]:
        encodings = ['utf-8', 'latin-1', 'cp1252']
        delimiters = [',', '\t', '|', ';']
        best_enc = 'utf-8'
        best_delim = ','

        for enc in encodings:
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    sample = [f.readline() for _ in range(5)]
                    text = "".join(sample)
                    if text:
                        best_enc = enc
                        # Count delimiter occurrences
                        counts = {d: text.count(d) for d in delimiters}
                        best_delim = max(counts, key=counts.get)
                        if counts[best_delim] == 0:
                            best_delim = ','
                        break
            except Exception:
                continue

        return best_delim, best_enc

    @staticmethod
    def _detect_zip_contents(file_path: str, result: FileDetectionResult):
        with zipfile.ZipFile(file_path, 'r') as z:
            namelist = z.namelist()
            result.inner_files = namelist
            result.sheet_count = len(namelist)

    @staticmethod
    def _detect_json_file(file_path: str, result: FileDetectionResult):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                rec_count = len(data)
                sample_rows = data[:5] if isinstance(data[0], dict) else []
                cols = list(data[0].keys()) if rec_count > 0 and isinstance(data[0], dict) else []
            elif isinstance(data, dict):
                rec_count = 1
                sample_rows = [data]
                cols = list(data.keys())
            else:
                rec_count = 0
                sample_rows = []
                cols = []

            result.sheet_count = 1
            result.sheets.append(SheetDetectionResult(
                sheet_name="JSON_Root",
                record_count=rec_count,
                column_count=len(cols),
                columns=cols,
                sample_data=sample_rows
            ))

    @staticmethod
    def _detect_xml_file(file_path: str, result: FileDetectionResult):
        tree = ET.parse(file_path)
        root = tree.getroot()
        children = list(root)
        rec_count = len(children)
        cols = list({elem.tag for child in children for elem in child}) if rec_count > 0 else []

        sample_rows = []
        for child in children[:5]:
            row = {}
            for elem in child:
                row[elem.tag] = elem.text or ''
            if row:
                sample_rows.append(row)

        result.sheet_count = 1
        result.sheets.append(SheetDetectionResult(
            sheet_name=root.tag,
            record_count=rec_count,
            column_count=len(cols),
            columns=cols,
            sample_data=sample_rows
        ))
