import pytest
import pandas as pd
from pathlib import Path
try:
    from backend.app.services.source_fbdi_merge import (
        values_match,
        detect_fbdi_customer_key,
        identify_comparison_columns,
        merge_source_fbdi,
        run_merge_pipeline,
        keys_match,
        robust_normalize_key,
        SOURCE_PRIMARY_KEY
    )
except ImportError:
    from app.services.source_fbdi_merge import (
        values_match,
        detect_fbdi_customer_key,
        identify_comparison_columns,
        merge_source_fbdi,
        run_merge_pipeline,
        keys_match,
        robust_normalize_key,
        SOURCE_PRIMARY_KEY
    )

def test_values_match():
    # Empty / null handling
    assert values_match("", "") is True
    assert values_match(None, None) is True
    assert values_match(float("nan"), "") is True
    assert values_match("Dallas", None) is False
    assert values_match("", "Dallas") is False

    # String comparison (case-insensitive, whitespace stripped)
    assert values_match("Dallas", "dallas") is True
    assert values_match("  Fort Worth ", "fort worth") is True
    assert values_match("Dallas", "Austin") is False

    # Numeric equivalence
    assert values_match("1000", "1000.00") is True
    assert values_match("$1,500.50", "1500.5") is True
    assert values_match("100", "200") is False

def test_detect_fbdi_customer_key():
    assert detect_fbdi_customer_key(["Customer Name", "City"]) == "Customer Name"
    assert detect_fbdi_customer_key(["*Customer Name", "City"]) == "*Customer Name"
    assert detect_fbdi_customer_key(["PARTY_NAME", "City"]) == "PARTY_NAME"
    assert detect_fbdi_customer_key(["Account_Name", "City"]) == "Account_Name"
    assert detect_fbdi_customer_key(["*Customer  Name", "City"]) == "*Customer  Name"

def test_keys_match_robust():
    # Trim whitespace, case-insensitive, BOM, non-breaking space
    assert keys_match("Customer Name", "Customer Name") is True
    assert keys_match("  Customer Name  ", "customer name") is True
    assert keys_match("\ufeffCustomer Name", "Customer Name") is True
    assert keys_match("Customer\xa0Name", "Customer Name") is True
    # Multiple spaces, underscores, dashes
    assert keys_match("Customer  Name", "Customer Name") is True
    assert keys_match("customer_name", "Customer Name") is True
    assert keys_match("customer-name", "Customer Name") is True
    # Leading asterisks (Oracle FBDI)
    assert keys_match("*Customer Name", "Customer Name") is True
    assert keys_match("Customer Name", "*Customer Name") is True
    assert keys_match("  *Customer_Name  ", "Customer Name") is True
    # Non-match
    assert keys_match("Project Number", "Customer Name") is False

def test_synthetic_merge_source_fbdi(tmp_path):
    src_data = {
        "Customer Name": ["Acme Corp", "Beta Industries", "Gamma LLC"],
        "City": ["Dallas", "Houston", "Austin"],
        "State": ["TX", "TX", "TX"],
        "Postal Zip": ["75001", "77001", "73301"],
        "Country": ["USA", "USA", "USA"],
        "Custom Source Only Field": ["A", "B", "C"]
    }
    fbdi_data = {
        "*Customer Name": ["Acme Corp", "Beta Industries"],
        "City": ["Dallas", "San Antonio"],  # Beta has mismatched City
        "State": ["TX", "TX"],
        "Postal Code": ["75001", "77001"],
        "*Country": ["USA", "USA"],
        "FBDI Only Field": ["X", "Y"]
    }

    src_file = tmp_path / "test_source.xlsx"
    fbdi_file = tmp_path / "test_fbdi.xlsx"
    out_file = tmp_path / "test_merged.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    merged = merge_source_fbdi(src_file, fbdi_file, out_file)

    assert out_file.exists()
    assert len(merged) == 3

    # Check status classification
    acme_row = merged[merged["Customer Name"] == "Acme Corp"].iloc[0]
    beta_row = merged[merged["Customer Name"] == "Beta Industries"].iloc[0]
    gamma_row = merged[merged["Customer Name"] == "Gamma LLC"].iloc[0]

    assert acme_row["Reconciliation_Status"] == "MATCH"
    assert beta_row["Reconciliation_Status"] == "MISMATCH"
    assert "City" in beta_row["Mismatch_Details"]
    assert gamma_row["Reconciliation_Status"] == "MISSING"

def test_non_airetech_merge_pipeline(tmp_path):
    # Tests non-Airetech filename with Customer Name (and double space) + *Customer Name
    src_data = {
        "Customer  Name": ["Client Alpha", "Client Beta"],
        "City": ["Chicago", "New York"],
    }
    fbdi_data = {
        "*Customer Name": ["Client Alpha", "Client Beta"],
        "City": ["Chicago", "Boston"],
    }

    src_file = tmp_path / "CJBS_Source_File.xlsx"
    fbdi_file = tmp_path / "CJBS_Target_File.xlsx"
    out_file = tmp_path / "CJBS_Merged.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    result = run_merge_pipeline(
        source_path=src_file,
        fbdi_path=fbdi_file,
        output_path=out_file
    )

    assert result["status"] == "SUCCESS"
    assert result["source_key"] == "Customer  Name"
    assert result["fbdi_key"] == "*Customer Name"
    assert result["total_merged"] == 2
    assert result["match_count"] == 1
    assert result["mismatch_count"] == 1

def test_custom_key_override_merge(tmp_path):
    # Tests explicit source_key and fbdi_key override
    src_data = {
        "Invoice_ID": ["INV-001", "INV-002"],
        "Amount": ["500", "750"],
    }
    fbdi_data = {
        "*Invoice Number": ["INV-001", "INV-002"],
        "Amount": ["500", "800"],
    }

    src_file = tmp_path / "Invoices_Source.xlsx"
    fbdi_file = tmp_path / "Invoices_FBDI.xlsx"
    out_file = tmp_path / "Invoices_Merged.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    result = run_merge_pipeline(
        source_path=src_file,
        fbdi_path=fbdi_file,
        output_path=out_file,
        source_key="Invoice_ID",
        fbdi_key="*Invoice Number"
    )

    assert result["status"] == "SUCCESS"
    assert result["source_key"] == "Invoice_ID"
    assert result["fbdi_key"] == "*Invoice Number"
    assert result["total_merged"] == 2
    assert result["match_count"] == 1
    assert result["mismatch_count"] == 1

if __name__ == "__main__":
    pytest.main([__file__, "-v"])



