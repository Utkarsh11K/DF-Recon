import sys
import traceback
sys.path.append('.')
from app.main import _get_dataframe_for_file

try:
    df1 = _get_dataframe_for_file('UploadCustomersTemplateAiretech 1.xlsm')
    print("DF1 shape:", df1.shape if df1 is not None else None)
    df2 = _get_dataframe_for_file('Airetech Customer Master.xlsx')
    print("DF2 shape:", df2.shape if df2 is not None else None)
except Exception as e:
    traceback.print_exc()
