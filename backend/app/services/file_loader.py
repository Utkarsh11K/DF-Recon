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


def load_dataframe(file_path: str, file_info: Optional[FileDetectionResult] = None) -> Optional[pd.DataFrame]:
    """
    Load a supported tabular file (csv/txt/dat/xlsx/xls/json/xml) into a
    pandas DataFrame. Returns None if the file can't be parsed.

    If `file_info` (from FileDetectorService.detect_file_and_sheets) is not
    supplied, it is computed here so callers can pass just a path.
    """
    if file_info is None:
        file_info = FileDetectorService.detect_file_and_sheets(file_path)

    ext = file_info.file_extension.lower()
    try:
        if ext in ['.xlsx', '.xls', '.xlsm']:
            engine = 'openpyxl' if ext in ['.xlsx', '.xlsm'] else 'xlrd'
            excel = pd.ExcelFile(file_path, engine=engine)
            for sheet in excel.sheet_names:
                if any(k in sheet.lower() for k in ["instruction", "readme", "summary", "overview", "metadata", "note"]):
                    continue
                try:
                    df = FileDetectorService.load_excel_sheet(excel, sheet)
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
