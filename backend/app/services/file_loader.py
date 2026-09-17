"""
Shared tabular file loading utility.

Extracted from ValidationChainEngine._load_dataframe so both the structural
ValidationChainEngine and the BusinessRuleEngine read files the same way,
without duplicating parsing logic.
"""
import pandas as pd
from typing import Optional
from app.schemas.validation_schema import FileDetectionResult
from app.services.file_detector import FileDetectorService


def load_dataframe(
    file_path: str,
    file_info: Optional[FileDetectionResult] = None,
    sheet_name: Optional[str] = None,
    target_column: Optional[str] = None,
) -> Optional[pd.DataFrame]:
    """
    Load a supported tabular file (csv/txt/dat/xlsx/xls/json/xml) into a
    pandas DataFrame. Returns None if the file can't be parsed.

    If `file_info` (from FileDetectorService.detect_file_and_sheets) is not
    supplied, it is computed here so callers can pass just a path.
    Supports optional `sheet_name` or `target_column` resolution.
    """
    if file_info is None:
        file_info = FileDetectorService.detect_file_and_sheets(file_path)

    ext = file_info.file_extension.lower()
    try:
        if ext in ['.xlsx', '.xls', '.xlsm']:
            engine = 'openpyxl' if ext in ['.xlsx', '.xlsm'] else 'xlrd'
            excel = pd.ExcelFile(file_path, engine=engine)

            # 1. If explicit sheet_name is provided and exists
            if sheet_name and sheet_name in excel.sheet_names:
                return FileDetectorService.load_excel_sheet(excel, sheet_name)

            # 2. If target_column is specified, search across detected sheets for it
            if target_column:
                target_norm = target_column.lstrip("*").strip().lower()
                for s in file_info.sheets:
                    if any(target_norm in c.lstrip("*").strip().lower() for c in s.columns):
                        try:
                            df = FileDetectorService.load_excel_sheet(excel, s.sheet_name)
                            if df is not None and not df.empty:
                                return df
                        except Exception:
                            pass

            # 3. Iterate sheets in ranked order from FileDetectorService
            auxiliary_keywords = [
                "instruction", "readme", "summary", "overview", "metadata",
                "note", "lov", "lookup", "lookups", "cover", "changelog", "info"
            ]
            candidate_sheets = [s.sheet_name for s in file_info.sheets] if file_info.sheets else excel.sheet_names

            for s_name in candidate_sheets:
                if any(k in s_name.lower() for k in auxiliary_keywords):
                    continue
                try:
                    df = FileDetectorService.load_excel_sheet(excel, s_name)
                    if df is not None and not df.empty:
                        return df
                except Exception:
                    pass

            return FileDetectorService.load_excel_sheet(excel, excel.sheet_names[0])
        elif ext in ['.csv', '.txt', '.dat']:
            delimiter = file_info.delimiter or ','
            encoding = file_info.encoding or 'utf-8'
            return pd.read_csv(file_path, sep=delimiter, encoding=encoding, low_memory=False)
        elif ext == '.json':
            return pd.read_json(file_path)
        elif ext == '.xml':
            return pd.read_xml(file_path)
    except Exception:
        return None
    return None
