import pandas as pd
import numpy as np
import os

def create_sample_data():
    os.makedirs("sample_data", exist_ok=True)
    
    # 1. Source Data (e.g., legacy customer data)
    num_records = 50
    source_df = pd.DataFrame({
        "LEGACY_CUST_ID": [f"CUST_{i:04d}" for i in range(1, num_records + 1)],
        "CUSTOMER_NAME": [f"Customer Name {i}" for i in range(1, num_records + 1)],
        "ACCOUNT_STATUS": np.random.choice(["Active", "Inactive", "Hold"], num_records),
        "EMAIL": [f"user{i}@example.com" for i in range(1, num_records + 1)],
    })
    source_df.to_csv("sample_data/source_customers.csv", index=False)
    
    # 2. FBDI Data (e.g., Oracle Fusion structure)
    # The key detection engine looks for synonyms. For LEGACY_CUST_ID, it expects ORIG_SYSTEM_REFERENCE
    # We will simulate missing records or duplicates to make the recon interesting.
    fbdi_records = []
    for i in range(1, num_records + 1):
        if i % 10 == 0:
            continue # Simulating missing records in FBDI
        fbdi_records.append({
            "ORIG_SYSTEM_REFERENCE": f"CUST_{i:04d}",
            "PARTY_NAME": f"Customer Name {i}",
            "STATUS": source_df.loc[i-1, "ACCOUNT_STATUS"],
            "EMAIL_ADDRESS": source_df.loc[i-1, "EMAIL"],
        })
    
    fbdi_df = pd.DataFrame(fbdi_records)
    fbdi_df.to_csv("sample_data/fbdi_customers.csv", index=False)
    
    print(f"Created sample_data/source_customers.csv ({len(source_df)} rows)")
    print(f"Created sample_data/fbdi_customers.csv ({len(fbdi_df)} rows)")
    
if __name__ == "__main__":
    create_sample_data()
