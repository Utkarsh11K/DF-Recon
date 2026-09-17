import os
import zipfile
import json
import xml.etree.ElementTree as ET
import pandas as pd
from typing import List, Tuple, Optional, Dict, Any
from app.schemas.validation_schema import FileDetectionResult, SheetDetectionResult

SUPPORTED_EXTENSIONS = {'.xlsx', '.xls', '.csv', '.txt', '.dat', '.zip', '.json', '.xml'}

class FileDetectorService:
    @staticmethod
    def is_supported_file(file_path: str) -> bool:
        ext = os.path.splitext(file_path)[1].lower()
        return ext in SUPPORTED_EXTENSIONS

    @staticmethod
    def detect_file_and_sheets(file_path: str, file_type: str = "SOURCE") -> FileDetectionResult:
        file_name = os.path.basename(file_path)
        ext = os.path.splitext(file_name)[1].lower()
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        is_supported = ext in SUPPORTED_EXTENSIONS

        result = FileDetectionResult(
            file_name=file_name,
            file_path=file_path,
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
            if ext in ['.xlsx', '.xls']:
                FileDetectorService._detect_excel_sheets(file_path, ext, result)
            elif ext in ['.csv', '.txt', '.dat']:
                FileDetectorService._detect_delimited_file(file_path, result)
            elif ext == '.zip':
                FileDetectorService._detect_zip_contents(file_path, result)
            elif ext == '.json':
                FileDetectorService._detect_json_file(file_path, result)
            elif ext == '.xml':
                FileDetectorService._detect_xml_file(file_path, result)
        except Exception as e:
            # If parsing fails during detection, record error state gracefully
            pass

        return result

    @staticmethod
    def _detect_excel_sheets(file_path: str, ext: str, result: FileDetectionResult):
        engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
        with pd.ExcelFile(file_path, engine=engine) as excel_file:
            sheet_names = excel_file.sheet_names
            result.sheet_count = len(sheet_names)

            for sheet in sheet_names:
                df = FileDetectorService.load_excel_sheet(excel_file, sheet)
                cols = [str(c) for c in df.columns.tolist()]
                sample_rows = df.head(5).to_dict(orient='records')
                sheet_res = SheetDetectionResult(
                    sheet_name=sheet,
                    record_count=len(df),
                    column_count=len(cols),
                    columns=cols,
                    sample_data=sample_rows
                )
                result.sheets.append(sheet_res)

    @staticmethod
    def load_excel_sheet(excel_file: pd.ExcelFile, sheet_name: str) -> pd.DataFrame:
        raw = pd.read_excel(excel_file, sheet_name=sheet_name, header=None)
        if raw.empty:
            return raw

        first_row = raw.iloc[0].tolist()
        second_row = raw.iloc[1].tolist() if len(raw.index) > 1 else []
        first_score = FileDetectorService._header_row_score(first_row)
        second_is_header = bool(second_row) and FileDetectorService._header_row_score(second_row) >= max(3, first_score * 0.35)
        if not second_is_header:
            second_row = []
        columns: list[str] = []
        used: set[str] = set()
        column_count = max(len(first_row), len(second_row))
        for index in range(column_count):
            first_name = FileDetectorService._clean_header_value(first_row[index] if index < len(first_row) else None)
            second_name = FileDetectorService._clean_header_value(second_row[index] if index < len(second_row) else None)
            name = FileDetectorService._choose_header_name(first_name, second_name, index)
            original_name = name
            suffix = 2
            while name in used:
                name = f'{original_name} {suffix}'
                suffix += 1
            used.add(name)
            columns.append(name)

        data = raw.iloc[2:].copy()
        data = data.iloc[:, :column_count]
        data.columns = columns
        return data.dropna(axis=0, how='all').reset_index(drop=True)

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
            sample_rows = df.head(5).to_dict(orient='records')
            result.sheet_count = 1
            result.sheets.append(SheetDetectionResult(
                sheet_name="Main",
                record_count=len(df),
                column_count=len(cols),
                columns=cols,
                sample_data=sample_rows
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
