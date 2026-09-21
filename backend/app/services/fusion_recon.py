import pandas as pd
from typing import Dict, Any, Optional

class FusionReconEngine:
    @staticmethod
    def compare_fusion_extract(
        source_df: pd.DataFrame,
        fusion_df: pd.DataFrame,
        source_key: str = "Customer Name",
        fusion_key: str = "PARTY_ORIG_SYSTEM_REFERENCE"
    ) -> Dict[str, Any]:
        """
        Compares Source records against Fusion extracts.
        1. Normalizes keys.
        2. Matches Source Reference to Fusion Reference.
        3. Identifies Missing in Oracle and Missing in Source.
        """
        
        if source_df is None or source_df.empty:
            return {"status": "ERROR", "message": "Source DataFrame is missing or empty."}
        if fusion_df is None or fusion_df.empty:
            return {"status": "ERROR", "message": "Fusion DataFrame is missing or empty."}
            
        def _normalize(val):
            return str(val).strip().casefold() if pd.notnull(val) else ""

        # Normalize keys for comparison
        source_df["_join_key"] = source_df.get(source_key, pd.Series()).apply(_normalize)
        fusion_df["_join_key"] = fusion_df.get(fusion_key, pd.Series()).apply(_normalize)
        
        source_df = source_df[source_df["_join_key"] != ""]
        fusion_df = fusion_df[fusion_df["_join_key"] != ""]
        
        source_keys = set(source_df["_join_key"])
        fusion_keys = set(fusion_df["_join_key"])
        
        matched_keys = source_keys.intersection(fusion_keys)
        missing_in_oracle = source_keys - fusion_keys
        extra_in_oracle = fusion_keys - source_keys
        
        # Build discrepancy list
        discrepancies = []
        for mk in missing_in_oracle:
            discrepancies.append({
                "type": "MISSING_IN_ORACLE",
                "key": mk,
                "reason": "Source record not found in Fusion extract"
            })
            
        for ek in extra_in_oracle:
            discrepancies.append({
                "type": "EXTRA_IN_ORACLE",
                "key": ek,
                "reason": "Fusion record not found in Source data"
            })
            
        # Simplified field matching (assuming column mappings would be provided in a real scenario)
        
        return {
            "status": "SUCCESS",
            "total_source": len(source_df),
            "total_fusion": len(fusion_df),
            "matched": len(matched_keys),
            "missing_in_oracle": len(missing_in_oracle),
            "extra_in_oracle": len(extra_in_oracle),
            "match_rate": (len(matched_keys) / len(source_df) * 100) if len(source_df) else 0,
            "discrepancies": discrepancies
        }
