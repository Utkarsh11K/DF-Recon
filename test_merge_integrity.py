import pandas as pd
import sys
from pathlib import Path

def run_tests():
    merged_file = Path("merged_source_fbdi.xlsx")
    
    if not merged_file.exists():
        print(f"Skipping tests: {merged_file} not found. Please run a merge from the UI first.")
        return

    print("Loading merged output...")
    df = pd.read_excel(merged_file, sheet_name="Merged_Source_FBDI", dtype=str)
    
    # 1. Row count checks
    merged_rows = len(df)
    print(f"Total merged rows: {merged_rows} (Expected 4353)")
    
    # Calculate unique source records
    unique_sources = df["Source_Row"].nunique()
    print(f"Total Source records: {unique_sources} (Expected 2399)")
    
    # 2. Status counts per source record
    deduped = df.drop_duplicates(subset=["Source_Row"])
    status_counts = deduped["Reconciliation_Status"].value_counts()
    print("\nCounts per Source record:")
    print(f"  Fully Mapped: {status_counts.get('Fully Mapped', 0)} (Expected 2255)")
    print(f"  Partially Matched: {status_counts.get('Partially Matched', 0)} (Expected 33)")
    print(f"  Fully Unmapped: {status_counts.get('Fully Unmapped', 0)} (Expected 111)")
    
    # 3. Data Integrity Spot Checks
    print("\nData Integrity Spot Checks:")
    
    # Source Code preservation (CNH-MCC, 1277B)
    source_codes = df["SRC | Source Code"].dropna().unique() if "SRC | Source Code" in df.columns else []
    print(f"  Source Code 'CNH-MCC' preserved: {'CNH-MCC' in source_codes}")
    print(f"  Source Code '1277B' preserved: {'1277B' in source_codes}")
    
    # Postal Zip
    postal_zips = df["SRC | Postal Zip"].dropna().unique() if "SRC | Postal Zip" in df.columns else []
    print(f"  Postal Zip '74101-3067' preserved: {'74101-3067' in postal_zips}")
    print(f"  Postal Zip 'J2C 7V5' preserved: {'J2C 7V5' in postal_zips}")
    
    # F/C Code
    fc_codes = df["SRC | F/C Code"].dropna().unique() if "SRC | F/C Code" in df.columns else []
    print(f"  F/C Code 'F' preserved (not boolean False): {'F' in fc_codes}")
    print(f"  F/C Code '0' preserved (not boolean False): {'0' in fc_codes}")
    
    # FBDI Identifying Address
    fbdi_ident = df["FBDI | Identifying Address"].dropna().unique() if "FBDI | Identifying Address" in df.columns else []
    print(f"  Identifying Address 'Y' preserved (not boolean True): {'Y' in fbdi_ident}")

if __name__ == "__main__":
    run_tests()
