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
                df = pd.read_excel(excel_file, sheet_name=sheet)
                cols = [str(c) for c in df.columns.tolist()]
                sheet_res = SheetDetectionResult(
                    sheet_name=sheet,
                    record_count=len(df),
                    column_count=len(cols),
                    columns=cols
                )
                result.sheets.append(sheet_res)

    @staticmethod
    def _detect_delimited_file(file_path: str, result: FileDetectionResult):
        # Auto-detect delimiter and encoding
        delimiter, encoding = FileDetectorService._guess_delimiter_and_encoding(file_path)
        result.delimiter = delimiter
        result.encoding = encoding

        try:
            df = pd.read_csv(file_path, sep=delimiter, encoding=encoding, low_memory=False)
            cols = [str(c) for c in df.columns.tolist()]
            result.sheet_count = 1
            result.sheets.append(SheetDetectionResult(
                sheet_name="Main",
                record_count=len(df),
                column_count=len(cols),
                columns=cols
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
                cols = list(data[0].keys()) if rec_count > 0 and isinstance(data[0], dict) else []
            elif isinstance(data, dict):
                rec_count = 1
                cols = list(data.keys())
            else:
                rec_count = 0
                cols = []

            result.sheet_count = 1
            result.sheets.append(SheetDetectionResult(
                sheet_name="JSON_Root",
                record_count=rec_count,
                column_count=len(cols),
                columns=cols
            ))

    @staticmethod
    def _detect_xml_file(file_path: str, result: FileDetectionResult):
        tree = ET.parse(file_path)
        root = tree.getroot()
        children = list(root)
        rec_count = len(children)
        cols = list({elem.tag for child in children for elem in child}) if rec_count > 0 else []

        result.sheet_count = 1
        result.sheets.append(SheetDetectionResult(
            sheet_name=root.tag,
            record_count=rec_count,
            column_count=len(cols),
            columns=cols
        ))
