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
        if ext in ['.xlsx', '.xls']:
            engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
            return pd.read_excel(file_path, engine=engine)
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
