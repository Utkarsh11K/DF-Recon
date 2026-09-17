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
        SOURCE_PRIMARY_KEY,
        generate_automatic_mappings,
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
        SOURCE_PRIMARY_KEY,
        generate_automatic_mappings,
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

    # Check status classification - ONLY 3 categories
    acme_row = merged[merged["Customer Name"] == "Acme Corp"].iloc[0]
    beta_row = merged[merged["Customer Name"] == "Beta Industries"].iloc[0]
    gamma_row = merged[merged["Customer Name"] == "Gamma LLC"].iloc[0]

    assert acme_row["Reconciliation_Status"] == "Fully Mapped"
    assert beta_row["Reconciliation_Status"] == "Partially Matched"
    assert "City" in beta_row["Mismatch_Details"]
    assert gamma_row["Reconciliation_Status"] == "Fully Unmapped"

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
    assert result["fully_mapped_count"] == 1
    assert result["partially_matched_count"] == 1
    assert result["fully_unmapped_count"] == 0

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

def test_generate_automatic_mappings(tmp_path):
    src_data = {
        "Customer Name": ["Company A", "Company B"],
        "Billing Street": ["100 Main St", "200 Oak Ave"],
        "Postal Code": ["60601", "10001"],
    }
    fbdi_data = {
        "*Customer Name": ["Company A", "Company B"],
        "Address Line 1": ["100 Main St", "200 Oak Ave"],
        "Postal Code": ["60601", "10001"],
    }

    src_file = tmp_path / "AutoMap_Source.xlsx"
    fbdi_file = tmp_path / "AutoMap_FBDI.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    detect_res = generate_automatic_mappings(src_file, fbdi_file)

    assert detect_res["status"] == "SUCCESS"
    assert detect_res["source_key"] == "Customer Name"
    assert detect_res["fbdi_key"] == "*Customer Name"
    
    # Verify mappings generated dynamically
    mappings = detect_res["mappings"]
    pk_map = next((m for m in mappings if m["is_primary_key"]), None)
    assert pk_map is not None
    assert pk_map["source_column"] == "Customer Name"
    assert pk_map["fbdi_column"] == "*Customer Name"

    # Verify matching column Postal Code mapped
    postal_map = next((m for m in mappings if m["source_column"] == "Postal Code"), None)
    assert postal_map is not None
    assert postal_map["fbdi_column"] == "Postal Code"

def test_user_edited_column_mappings_applied_in_merge(tmp_path):
    # Tests that when user edits a column mapping (e.g. Billing Street -> Address Line 1),
    # it is used by the merge logic for comparison
    src_data = {
        "Customer Name": ["Acme Corp"],
        "Billing Street": ["123 Broadway"],
    }
    fbdi_data = {
        "*Customer Name": ["Acme Corp"],
        "Address Line 1": ["123 Broadway"],
    }

    src_file = tmp_path / "CustomMap_Source.xlsx"
    fbdi_file = tmp_path / "CustomMap_FBDI.xlsx"
    out_file = tmp_path / "CustomMap_Merged.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    # Supply custom user-edited mapping: Billing Street -> Address Line 1
    custom_mappings = {
        "Billing Street": "Address Line 1"
    }

    result = run_merge_pipeline(
        source_path=src_file,
        fbdi_path=fbdi_file,
        output_path=out_file,
        column_mappings=custom_mappings
    )

    assert result["status"] == "SUCCESS"
    assert result["total_merged"] == 1
    # Because Billing Street was mapped to Address Line 1 and both are "123 Broadway",
    # the comparison should MATCH!
    assert result["match_count"] == 1
    assert result["mismatch_count"] == 0

def test_dynamic_fbdi_party_name_detection_from_data_and_schema(tmp_path):
    # FBDI uses "Party Name" containing corresponding customer values
    src_data = {
        "Customer Name": ["Global Logistics Inc", "Apex Enterprises"],
        "City": ["Chicago", "Dallas"],
    }
    fbdi_data = {
        "Party Name": ["Global Logistics Inc", "Apex Enterprises"],
        "City": ["Chicago", "Dallas"],
    }

    src_file = tmp_path / "PartyName_Source.xlsx"
    fbdi_file = tmp_path / "PartyName_FBDI.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    detect_res = generate_automatic_mappings(src_file, fbdi_file)

    assert detect_res["status"] == "SUCCESS"
    assert detect_res["source_key"] == "Customer Name"
    assert detect_res["fbdi_key"] == "Party Name"

    pk_map = next((m for m in detect_res["mappings"] if m["is_primary_key"]), None)
    assert pk_map is not None
    assert pk_map["source_column"] == "Customer Name"
    assert pk_map["fbdi_column"] == "Party Name"

def test_dynamic_fbdi_party_name_merge_records(tmp_path):
    # Tests that records are accurately mapped and merged when FBDI uses Party Name
    src_data = {
        "Customer Name": ["Global Logistics Inc", "Apex Enterprises"],
        "City": ["Chicago", "Dallas"],
    }
    fbdi_data = {
        "Party Name": ["Global Logistics Inc", "Apex Enterprises"],
        "City": ["Chicago", "Austin"],  # Austin mismatches Dallas
    }

    src_file = tmp_path / "PartyMerge_Source.xlsx"
    fbdi_file = tmp_path / "PartyMerge_FBDI.xlsx"
    out_file = tmp_path / "PartyMerge_Merged.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    result = run_merge_pipeline(
        source_path=src_file,
        fbdi_path=fbdi_file,
        output_path=out_file
    )

    assert result["status"] == "SUCCESS"
    assert result["source_key"] == "Customer Name"
    assert result["fbdi_key"] == "Party Name"
    assert result["total_merged"] == 2
    assert result["match_count"] == 1  # Chicago matches
    assert result["mismatch_count"] == 1  # Dallas vs Austin mismatches

def test_dynamic_fbdi_arbitrary_column_from_actual_data(tmp_path):
    # Even if FBDI column has non-standard name like "Organization_Entity",
    # actual data overlap detects it dynamically without hardcoding
    src_data = {
        "Customer Name": ["Zeta Corp", "Theta LLC"],
        "State": ["TX", "CA"],
    }
    fbdi_data = {
        "Organization_Entity": ["Zeta Corp", "Theta LLC"],
        "State": ["TX", "CA"],
    }

    src_file = tmp_path / "Arbitrary_Source.xlsx"
    fbdi_file = tmp_path / "Arbitrary_FBDI.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    detect_res = generate_automatic_mappings(src_file, fbdi_file)

    assert detect_res["status"] == "SUCCESS"
    assert detect_res["source_key"] == "Customer Name"
    assert detect_res["fbdi_key"] == "Organization_Entity"

def test_consolidated_no_duplication_and_three_categories(tmp_path):
    # Ensures each matched Source/FBDI pair appears as ONE consolidated record (never duplicated),
    # and statuses are STRICTLY one of the 3 categories:
    # 'Fully Mapped', 'Partially Matched', 'Fully Unmapped'
    src_data = {
        "Customer Name": ["Client 1", "Client 2", "Client 3"],
        "City": ["Dallas", "Chicago", "Miami"],
        "Zip": ["75001", "60601", "33101"],
    }
    # FBDI has duplicates for Client 1 (e.g. multiple addresses or sites in template)
    fbdi_data = {
        "*Customer Name": ["Client 1", "Client 1", "Client 2"],
        "City": ["Dallas", "Dallas", ""],  # Client 2 is missing City data in FBDI
        "Zip": ["75001", "75001", "60601"],
    }

    src_file = tmp_path / "Dedup_Source.xlsx"
    fbdi_file = tmp_path / "Dedup_FBDI.xlsx"
    out_file = tmp_path / "Dedup_Merged.xlsx"

    pd.DataFrame(src_data).to_excel(src_file, index=False)
    pd.DataFrame(fbdi_data).to_excel(fbdi_file, index=False)

    result = run_merge_pipeline(
        source_path=src_file,
        fbdi_path=fbdi_file,
        output_path=out_file
    )

    # Must have exactly 3 consolidated records, not 4 (no duplicate for Client 1)
    assert result["total_merged"] == 3
    assert result["fully_mapped_count"] == 1    # Client 1
    assert result["partially_matched_count"] == 1 # Client 2
    assert result["fully_unmapped_count"] == 1    # Client 3

    merged_df = pd.read_excel(out_file)
    assert len(merged_df) == 3

    statuses = set(merged_df["Reconciliation_Status"].unique())
    # MUST ONLY be the 3 categories
    assert statuses == {"Fully Mapped", "Partially Matched", "Fully Unmapped"}
    assert "MATCH" not in statuses
    assert "MISMATCH" not in statuses
    assert "MISSING" not in statuses

def test_category_counts_match_all_returned_records_without_preview_limits(tmp_path):
    # Generates a dataset exceeding 300 rows (e.g. 450 rows) with dynamic numbers of:
    # - Fully Mapped (e.g. 300)
    # - Partially Matched (e.g. 33)
    # - Fully Unmapped (e.g. 117)
    # Verifies that result["records"] is NOT truncated and category counts match displayed records exactly.
    n_fully_mapped = 300
    n_partially_matched = 33
    n_fully_unmapped = 117
    total = n_fully_mapped + n_partially_matched + n_fully_unmapped  # 450 records

    src_names = [f"Customer_{i}" for i in range(total)]
    src_cities = [f"City_{i}" for i in range(total)]

    # FBDI data
    # 1. Fully mapped: same name and same city
    fbdi_names = [f"Customer_{i}" for i in range(n_fully_mapped)]
    fbdi_cities = [f"City_{i}" for i in range(n_fully_mapped)]

    # 2. Partially matched: same name, but city is different ("Discrepant_City")
    for i in range(n_fully_mapped, n_fully_mapped + n_partially_matched):
        fbdi_names.append(f"Customer_{i}")
        fbdi_cities.append(f"Diff_City_{i}")

    # 3. Fully unmapped: not in FBDI at all

    src_file = tmp_path / "Large_Source.xlsx"
    fbdi_file = tmp_path / "Large_FBDI.xlsx"
    out_file = tmp_path / "Large_Merged.xlsx"

    pd.DataFrame({"Customer Name": src_names, "City": src_cities}).to_excel(src_file, index=False)
    pd.DataFrame({"*Customer Name": fbdi_names, "City": fbdi_cities}).to_excel(fbdi_file, index=False)

    result = run_merge_pipeline(
        source_path=src_file,
        fbdi_path=fbdi_file,
        output_path=out_file
    )

    assert result["total_merged"] == total
    assert result["fully_mapped_count"] == n_fully_mapped
    assert result["partially_matched_count"] == n_partially_matched
    assert result["fully_unmapped_count"] == n_fully_unmapped

    # Crucial check: records must NOT be truncated by head(300) or any limit
    records = result["records"]
    assert len(records) == total

    # Category counts must match the actual records belonging to that category in records
    displayed_partially_matched = [r for r in records if r["Reconciliation_Status"] == "Partially Matched"]
    displayed_fully_mapped = [r for r in records if r["Reconciliation_Status"] == "Fully Mapped"]
    displayed_fully_unmapped = [r for r in records if r["Reconciliation_Status"] == "Fully Unmapped"]

    assert len(displayed_partially_matched) == result["partially_matched_count"] == 33
    assert len(displayed_fully_mapped) == result["fully_mapped_count"] == 300
    assert len(displayed_fully_unmapped) == result["fully_unmapped_count"] == 117

if __name__ == "__main__":
    pytest.main([__file__, "-v"])





