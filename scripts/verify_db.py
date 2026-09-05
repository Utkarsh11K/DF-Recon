import os
import sys
import time

def verify_postgres_connection():
    print("=" * 60)
    print("LightSpeed Database Connectivity & Schema Verification")
    print("=" * 60)
    
    db_url = os.environ.get("DATABASE_URL", "postgresql://lightspeed_user:lightspeed_pass@localhost:5432/lightspeed_db")
    print(f"Connecting to: {db_url}")

    try:
        import psycopg2
    except ImportError:
        print("[!] psycopg2 or psycopg2-binary package not installed in environment.")
        print("[!] Installing psycopg2-binary...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
        import psycopg2

    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            conn = psycopg2.connect(db_url)
            cursor = conn.cursor()
            print("[✓] Successfully connected to PostgreSQL Database!")

            # Fetch table list
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = [row[0] for row in cursor.fetchall()]
            print(f"\n[✓] Found {len(tables)} tables in 'public' schema:")
            for t in tables:
                cursor.execute(f"SELECT COUNT(*) FROM {t};")
                count = cursor.fetchone()[0]
                print(f"  - {t:<25} ({count} rows)")

            # Fetch reference seed counts
            print("\n[✓] Sample Seed Verification:")
            cursor.execute("SELECT project_name FROM projects;")
            print(f"  - Project: {cursor.fetchall()}")

            cursor.execute("SELECT opco_name FROM opcos;")
            print(f"  - Operating Companies: {[row[0] for row in cursor.fetchall()]}")

            cursor.execute("SELECT module_name FROM modules;")
            print(f"  - Modules: {[row[0] for row in cursor.fetchall()]}")

            cursor.execute("SELECT entity_name FROM entities;")
            print(f"  - Entities: {[row[0] for row in cursor.fetchall()]}")

            cursor.execute("SELECT rule_id, rule_name FROM business_rules;")
            print(f"  - Business Rules: {cursor.fetchall()}")

            cursor.close()
            conn.close()
            print("\n[✓] ALL DATABASE VERIFICATIONS PASSED SUCCESSFULLY!")
            return True

        except Exception as e:
            print(f"[!] Connection attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                time.sleep(2)
            else:
                print("\n[X] Could not connect to PostgreSQL database.")
                print("    Make sure Docker container is running: `docker compose up -d`")
                return False

if __name__ == "__main__":
    verify_postgres_connection()
