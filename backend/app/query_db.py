import psycopg2
import json

conn = psycopg2.connect('dbname=df_recon user=df_recon_user password=df_recon_password host=df-recon-postgres')
cur = conn.cursor()
cur.execute('''
    SELECT f.id, f.file_name, f.uploaded_at, t.columns_json 
    FROM (
        SELECT id, file_name, uploaded_at FROM app_files 
        UNION ALL 
        SELECT id, file_name, uploaded_at FROM app_fbdi_files
    ) f 
    JOIN app_dynamic_tables t ON f.id = t.file_id 
    ORDER BY f.uploaded_at DESC
''')
rows = cur.fetchall()
print(f'Found {len(rows)} dynamic tables.')
for r in rows:
    cols = json.loads(r[3]) if isinstance(r[3], str) else r[3]
    types = list(set(c.get("pg_type") for c in cols))
    print(f'File: {r[1]}, ID: {r[0]}, Uploaded: {r[2]}, Types: {types}')
