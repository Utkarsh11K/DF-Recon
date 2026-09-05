import os
import tempfile
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.file_detector import FileDetectorService
from app.services.validator_chain import ValidationChainEngine

client = TestClient(app)

def test_non_existent_folder():
    report = ValidationChainEngine.execute_validation_chain("/path/does/not/exist/12345")
    assert report.folder_exists is False
    assert report.overall_status == "FAIL"
    assert report.validation_steps[0].status == "FAIL"

def test_folder_without_supported_files():
    with tempfile.TemporaryDirectory() as temp_dir:
        with open(os.path.join(temp_dir, "test.pdf"), "w") as f:
            f.write("unsupported format")
        
        report = ValidationChainEngine.execute_validation_chain(temp_dir)
        assert report.folder_exists is True
        assert report.has_supported_file is False
        assert report.overall_status == "FAIL"

def test_empty_file_zero_bytes():
    with tempfile.TemporaryDirectory() as temp_dir:
        empty_file_path = os.path.join(temp_dir, "data.csv")
        open(empty_file_path, "w").close()

        report = ValidationChainEngine.execute_validation_chain(temp_dir, target_file_name="data.csv")
        assert report.folder_exists is True
        assert report.has_supported_file is True
        assert report.overall_status == "FAIL"
        assert any(s.step_name == "File Size Validation" and s.status == "FAIL" for s in report.validation_steps)

def test_valid_csv_validation_chain():
    with tempfile.TemporaryDirectory() as temp_dir:
        csv_path = os.path.join(temp_dir, "customers.csv")
        df = pd.DataFrame({
            "CUSTOMER_ID": ["C101", "C102", "C103", "C101"],
            "NAME": ["Alice", "Bob", None, "Alice"],
            "BALANCE": [100.5, 250.0, 0.0, 100.5]
        })
        df.to_csv(csv_path, index=False)

        report = ValidationChainEngine.execute_validation_chain(
            folder_path=temp_dir,
            target_file_name="customers.csv",
            required_columns=["CUSTOMER_ID", "NAME", "BALANCE"],
            primary_key_column="CUSTOMER_ID"
        )

        assert report.overall_status == "WARNING"
        assert report.record_count == 4
        assert report.duplicate_records_count == 2
        assert report.null_values_summary.get("NAME") == 1
        assert len(report.missing_required_columns) == 0

def test_excel_sheet_detection():
    with tempfile.TemporaryDirectory() as temp_dir:
        xlsx_path = os.path.join(temp_dir, "multi_sheet.xlsx")
        df1 = pd.DataFrame({"ID": [1, 2], "VAL": ["A", "B"]})
        df2 = pd.DataFrame({"CODE": [10, 20, 30], "STATUS": ["X", "Y", "Z"]})
        
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df1.to_excel(writer, sheet_name="Customers", index=False)
            df2.to_excel(writer, sheet_name="Orders", index=False)

        detection = FileDetectorService.detect_file_and_sheets(xlsx_path)
        assert detection.sheet_count == 2
        sheet_names = [s.sheet_name for s in detection.sheets]
        assert "Customers" in sheet_names
        assert "Orders" in sheet_names

def test_discovery_dual_upload_api():
    # Test uploading both Source File and Fusion Target Extract
    src_content = b"CUST_ID,NAME\nC100,John\nC101,Jane\n"
    tgt_content = b"CUST_ID,FUSION_NAME\nC100,John\nC101,Jane\n"
    
    files = {
        "source_file": ("source_customers.csv", src_content, "text/csv"),
        "target_file": ("fusion_extract.csv", tgt_content, "text/csv")
    }
    
    response = client.post("/api/v1/discovery/upload-and-detect", files=files, data={"batch_id": "Batch_001"})
    assert response.status_code == 200
    data = response.json()
    
    assert data["batch_id"] == "Batch_001"
    assert data["source_file_info"]["file_name"] == "source_customers.csv"
    assert data["source_file_info"]["file_type"] == "SOURCE"
    assert data["target_file_info"]["file_name"] == "fusion_extract.csv"
    assert data["target_file_info"]["file_type"] == "TARGET_EXTRACT"
