import os
import io
import json
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

class ReportGenerator:
    @staticmethod
    def generate_report(run_record: tuple, run_results: list) -> bytes:
        """
        Generates the reconciliation report using the AiretechCustomerRecon template.
        run_record: from recon_runs
        run_results: from recon_run_results
        """
        template_path = os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "..", "templates", "AiretechCustomerRecon.xlsx"
        ))
        
        workbook = load_workbook(template_path)
        
        # We need to map the data from the DB into the sheets
        # run_record schema: (run_id, created_at, source_file_id, fbdi_file_id, 
        #                     source_file_name, fbdi_file_name, source_sheet_name, 
        #                     fbdi_sheet_name, source_row_count, fbdi_row_count, 
        #                     source_key, fbdi_key, column_mappings, status_counts)
        run_id = run_record[0]
        source_file_name = run_record[4]
        fbdi_file_name = run_record[5]
        source_row_count = run_record[8] or 0
        fbdi_row_count = run_record[9] or 0
        
        status_counts = run_record[13] if run_record[13] else {}
        if isinstance(status_counts, str):
            status_counts = json.loads(status_counts)
            
        matched = status_counts.get("fully_mapped", 0)
        unmatched_source = status_counts.get("fully_unmapped", 0)
        unmatched_target = status_counts.get("partially_matched", 0) # Mapping mismatched as partial for now
        
        match_rate = round((matched / source_row_count) * 100, 2) if source_row_count else 0
        
        # Update Recon Sheet
        if "Recon" in workbook.sheetnames:
            recon = workbook["Recon"]
            
            # These are illustrative rows to match the style of the user's template
            recon["B22"] = source_row_count
            recon["E22"] = fbdi_row_count
            recon["B23"] = matched
            recon["E23"] = match_rate / 100 if match_rate else 0
            recon["B24"] = unmatched_source
            recon["E24"] = unmatched_target
            
            recon["B27"] = source_file_name
            recon["B28"] = fbdi_file_name
            
        # Update Diff Customers
        if "Diff Customers" in workbook.sheetnames:
            customer_sheet = workbook["Diff Customers"]
            for row in run_results:
                # row schema: (id, run_id, source_original_row, fbdi_original_row, status, reason, mismatch_details)
                status = row[4]
                if status != "Fully Mapped":
                    reason = row[5] or status
                    # Using row[2] as key for simplicity; in a real app, we'd store the actual Customer Name
                    customer_sheet.append([f"Row {row[2]}", reason, status])
                    
        # General formatting
        header_fill = PatternFill("solid", fgColor="1F4E78")
        for sheet_name in workbook.sheetnames:
            sheet = workbook[sheet_name]
            for cell in sheet[1]:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = header_fill
            for column in range(1, sheet.max_column + 1):
                letter = get_column_letter(column)
                sheet.column_dimensions[letter].width = 20
                
        output = io.BytesIO()
        workbook.save(output)
        return output.getvalue()
