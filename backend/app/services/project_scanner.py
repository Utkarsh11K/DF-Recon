import os
import uuid
import json
from typing import List, Dict, Any, Optional

import psycopg2
from psycopg2.extras import RealDictCursor

# Simple JSON-based fallback store if Postgres is unavailable
PROJECTS_DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "projects_db.json")

def get_db_connection():
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        try:
            return psycopg2.connect(db_url)
        except Exception as e:
            print(f"Error connecting to Postgres: {e}")
    return None

def load_db() -> Dict[str, Any]:
    if os.path.exists(PROJECTS_DB_FILE):
        try:
            with open(PROJECTS_DB_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"projects": {}, "modules": {}, "entities": {}, "batches": {}, "files": {}}

def save_db(data: Dict[str, Any]):
    os.makedirs(os.path.dirname(PROJECTS_DB_FILE), exist_ok=True)
    with open(PROJECTS_DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

class ProjectScannerService:
    STANDARD_TAXONOMY = {
        "01_Human Capital": ["01_Employees"],
        "02_Product Management": ["02_Items", "03_Item Pricing"],
        "03_Order Management": ["04_Customers", "07_Sales Orders"],
        "04_Procurement": ["05_Suppliers", "08_Purchase Orders"],
        "05_Inventory Management": ["06_Item On Hand"],
        "06_Receivables": ["09_AR Open Items"],
        "07_Payables": ["10_AP Open Items"],
        "08_Projects": ["11_Project Header", "12_Project Lines", "13_Project Materials"],
        "09_Service": ["14_Service Requests"],
        "10_CRM": ["15_Leads", "16_Opportunities"],
        "11_Incentive Compensation": ["17_Commissions", "18_Commission Splits"]
    }

    @staticmethod
    def _is_role_folder(folder_name: str) -> bool:
        p = folder_name.lower()
        if p.startswith(("01-source", "01_source")) or p == "source": return True
        if p.startswith(("02-tranformed", "02_tranformed", "02-enriched", "02_enriched")) or p in ("tranformed", "enriched"): return True
        if p.startswith(("03-fbdi", "03_fbdi")) or p == "fbdi": return True
        if p.startswith(("04-fusion", "04_fusion", "04-target", "04_target")) or p in ("fusion", "target"): return True
        return False

    @staticmethod
    def import_project_from_path(name: str, desc: str, path: str, status: str, tags: str, file_paths_json: str = None) -> Dict[str, Any]:
        """Scans the root path and builds the project hierarchy in the database."""
        project_id = f"proj_{uuid.uuid4().hex[:8]}"
        
        conn = get_db_connection()
        if conn:
            # POSTGRES FLOW
            try:
                cursor = conn.cursor()
                cursor.execute("INSERT INTO app_projects (id, name, description, root_path, status, tags) VALUES (%s, %s, %s, %s, %s, %s)",
                               (project_id, name, desc, path, status, tags))
                
                # Pre-populate Standard Taxonomy
                modules_map = {} # name -> id
                for mod, entities in ProjectScannerService.STANDARD_TAXONOMY.items():
                    module_id = f"mod_{uuid.uuid4().hex[:8]}"
                    cursor.execute("INSERT INTO app_modules (id, project_id, name) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (module_id, project_id, mod))
                    modules_map[mod] = module_id
                    
                    for ent in entities:
                        entity_id = f"ent_{uuid.uuid4().hex[:8]}"
                        cursor.execute("INSERT INTO app_entities (id, module_id, name) VALUES (%s, %s, %s)", (entity_id, module_id, ent))
                        
                        batch_id = f"{project_id}_{mod}_{ent}"
                        batch_name = f"{mod}_{ent}"
                        batch_path = os.path.join(path, mod, ent)
                        cursor.execute("INSERT INTO app_batches (id, project_id, module_id, entity_id, name, path) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                                       (batch_id, project_id, module_id, entity_id, batch_name, batch_path))
                
                if file_paths_json:
                    file_paths = json.loads(file_paths_json)
                    for fpath in file_paths:
                        fpath = fpath.replace("\\", "/")
                        parts = fpath.split("/")
                        
                        role_idx = -1
                        for i, p in enumerate(parts):
                            if ProjectScannerService._is_role_folder(p):
                                role_idx = i
                                break
                                
                        if role_idx >= 2:
                            entity_name = parts[role_idx - 1]
                            module_name = parts[role_idx - 2]
                            
                            if module_name not in modules_map:
                                cursor.execute("SELECT id FROM app_modules WHERE name = %s AND project_id = %s", (module_name, project_id))
                                res = cursor.fetchone()
                                if res:
                                    modules_map[module_name] = res[0]
                                else:
                                    module_id = f"mod_{uuid.uuid4().hex[:8]}"
                                    cursor.execute("INSERT INTO app_modules (id, project_id, name) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (module_id, project_id, module_name))
                                    modules_map[module_name] = module_id
                            module_id = modules_map[module_name]
                            
                            entity_id = f"ent_{uuid.uuid4().hex[:8]}"
                            cursor.execute("SELECT id FROM app_entities WHERE name = %s AND module_id = %s", (entity_name, module_id))
                            res = cursor.fetchone()
                            if not res:
                                cursor.execute("INSERT INTO app_entities (id, module_id, name) VALUES (%s, %s, %s)", (entity_id, module_id, entity_name))
                            else:
                                entity_id = res[0]
                                
                            batch_id = f"{project_id}_{module_name}_{entity_name}"
                            batch_name = f"{module_name}_{entity_name}"
                            # Calculate exact physical path from relative fpath
                            batch_rel_path = "/".join(parts[:role_idx])
                            batch_path = os.path.join(path, batch_rel_path)
                            
                            # Use UPDATE to set the path if it already exists, so we get the accurate path even if standard taxonomy inserted it first
                            cursor.execute("""
                                INSERT INTO app_batches (id, project_id, module_id, entity_id, name, path) 
                                VALUES (%s, %s, %s, %s, %s, %s) 
                                ON CONFLICT (id) DO UPDATE SET path = EXCLUDED.path
                            """, (batch_id, project_id, module_id, entity_id, batch_name, batch_path))
                
                conn.commit()
                
                cursor.execute("SELECT id, project_id, module_id, entity_id, name, path FROM app_batches WHERE project_id = %s", (project_id,))
                project_batches = [{"id": r[0], "project_id": r[1], "module_id": r[2], "entity_id": r[3], "name": r[4], "path": r[5]} for r in cursor.fetchall()]
                cursor.close()
                conn.close()
                return {"project_id": project_id, "batches": project_batches, "message": "Project imported successfully (Postgres)."}
            except Exception as e:
                print(f"Postgres error: {e}")
                if conn: conn.rollback()
        
        # JSON FALLBACK FLOW (if postgres is down)
        db = load_db()
        
        project = {
            "id": project_id,
            "name": name,
            "description": desc,
            "root_path": path,
            "status": status,
            "tags": tags
        }
        db["projects"][project_id] = project
        
        # Pre-populate Standard Taxonomy
        modules_map = {} # name -> id
        for mod, entities in ProjectScannerService.STANDARD_TAXONOMY.items():
            module_id = f"mod_{uuid.uuid4().hex[:8]}"
            db["modules"][module_id] = {"id": module_id, "project_id": project_id, "name": mod}
            modules_map[mod] = module_id
            
            for ent in entities:
                entity_id = f"ent_{uuid.uuid4().hex[:8]}"
                db["entities"][entity_id] = {"id": entity_id, "module_id": module_id, "name": ent}
                
                batch_id = f"{project_id}_{mod}_{ent}"
                batch_name = f"{mod}_{ent}"
                batch_path = os.path.join(path, mod, ent)
                db["batches"][batch_id] = {
                    "id": batch_id, "project_id": project_id, "module_id": module_id,
                    "entity_id": entity_id, "name": batch_name, "path": batch_path
                }
        
        # If frontend sent file paths, use them since backend might not have disk access
        if file_paths_json:
            try:
                file_paths = json.loads(file_paths_json)
                for fpath in file_paths:
                    fpath = fpath.replace("\\", "/")
                    parts = fpath.split("/")
                    
                    role_idx = -1
                    for i, p in enumerate(parts):
                        if ProjectScannerService._is_role_folder(p):
                            role_idx = i
                            break
                            
                    if role_idx >= 2:
                        entity_name = parts[role_idx - 1]
                        module_name = parts[role_idx - 2]
                        
                        if module_name not in modules_map:
                            existing_mod = next((m for m in db["modules"].values() if m["name"] == module_name and m["project_id"] == project_id), None)
                            if existing_mod:
                                modules_map[module_name] = existing_mod["id"]
                            else:
                                module_id = f"mod_{uuid.uuid4().hex[:8]}"
                                db["modules"][module_id] = {
                                    "id": module_id, "project_id": project_id, "name": module_name
                                }
                                modules_map[module_name] = module_id
                        module_id = modules_map[module_name]
                        
                        entity_id = f"ent_{uuid.uuid4().hex[:8]}"
                        if not any(e["name"] == entity_name and e["module_id"] == module_id for e in db["entities"].values()):
                            db["entities"][entity_id] = {
                                "id": entity_id, "module_id": module_id, "name": entity_name
                            }
                        else:
                            entity_id = next(e["id"] for e in db["entities"].values() if e["name"] == entity_name and e["module_id"] == module_id)
                            
                        batch_id = f"{project_id}_{module_name}_{entity_name}"
                        batch_name = f"{module_name}_{entity_name}"
                        batch_rel_path = "/".join(parts[:role_idx])
                        batch_path = os.path.join(path, batch_rel_path)
                        
                        if batch_id not in db["batches"] or db["batches"][batch_id]["path"] != batch_path:
                            db["batches"][batch_id] = {
                                "id": batch_id, "project_id": project_id, "module_id": module_id,
                                "entity_id": entity_id, "name": batch_name, "path": batch_path
                            }
            except Exception as e:
                print(f"Error parsing file_paths_json: {e}")
        elif os.path.exists(path) and os.path.isdir(path):
            # Level 1: Modules
            for module_name in os.listdir(path):
                module_path = os.path.join(path, module_name)
                if not os.path.isdir(module_path):
                    continue
                    
                module_id = f"mod_{uuid.uuid4().hex[:8]}"
                db["modules"][module_id] = {
                    "id": module_id,
                    "project_id": project_id,
                    "name": module_name
                }
                
                # Level 2: Entities
                for entity_name in os.listdir(module_path):
                    entity_path = os.path.join(module_path, entity_name)
                    if not os.path.isdir(entity_path):
                        continue
                        
                    entity_id = f"ent_{uuid.uuid4().hex[:8]}"
                    db["entities"][entity_id] = {
                        "id": entity_id,
                        "module_id": module_id,
                        "name": entity_name
                    }
                    
                    # Create Batch
                    batch_id = f"{project_id}_{module_name}_{entity_name}"
                    batch_name = f"{module_name}_{entity_name}"
                    batch_obj = {
                        "id": batch_id,
                        "project_id": project_id,
                        "module_id": module_id,
                        "entity_id": entity_id,
                        "name": batch_name,
                        "path": entity_path
                    }
                    db["batches"][batch_id] = batch_obj
                    
                    # Standard folders: 01-Source, 04-Fusion
                    ProjectScannerService._scan_entity_files(db, batch_id, entity_path)
                
        save_db(db)
        
        # return the batches created for this project
        project_batches = [b for b in db.get("batches", {}).values() if b["project_id"] == project_id]
        
        return {"project_id": project_id, "batches": project_batches, "message": "Project imported successfully."}

    @staticmethod
    def _scan_entity_files(db: Dict[str, Any], batch_id: str, entity_path: str):
        # Look for files inside role folders
        for root, _, files in os.walk(entity_path):
            folder_name = os.path.basename(root)
            if not ProjectScannerService._is_role_folder(folder_name):
                continue
            
            p = folder_name.lower()
            file_type = None
            if p.startswith(("01-source", "01_source")) or p == "source":
                file_type = "SOURCE"
            elif p.startswith(("04-fusion", "04_fusion", "04-target", "04_target")) or p in ("fusion", "target"):
                file_type = "TARGET_EXTRACT"
                
            if file_type:
                for f in files:
                    # simplistic check for supported extensions
                    if f.endswith(('.csv', '.xlsx', '.xls', '.dat', '.txt')) and not f.startswith("~$"):
                        file_id = f"file_{uuid.uuid4().hex[:8]}"
                        db["files"][file_id] = {
                            "id": file_id,
                            "batch_id": batch_id,
                            "file_type": file_type,
                            "file_name": f,
                            "file_path": os.path.join(root, f)
                        }

    @staticmethod
    def get_files_for_batch(batch_id: str) -> Dict[str, Any]:
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("SELECT id, batch_id, file_type, file_name, file_path FROM app_files WHERE batch_id = %s", (batch_id,))
                files = cursor.fetchall()
                cursor.close()
                conn.close()
                
                source_file = next((f for f in files if f["file_type"] == "SOURCE"), None)
                target_file = next((f for f in files if f["file_type"] == "TARGET_EXTRACT"), None)
                
                return {
                    "source_file": source_file,
                    "target_file": target_file
                }
            except Exception as e:
                print(f"Error querying Postgres for batch files: {e}")
                
        db = load_db()
        files = db.get("files", {})
        batch_files = [f for f in files.values() if f["batch_id"] == batch_id]
        
        source_file = next((f for f in batch_files if f["file_type"] == "SOURCE"), None)
        target_file = next((f for f in batch_files if f["file_type"] == "TARGET_EXTRACT"), None)
        
        return {
            "source_file": source_file,
            "target_file": target_file
        }
    
    @staticmethod
    def get_batch(batch_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("SELECT id, project_id, module_id, entity_id, name, path FROM app_batches WHERE id = %s", (batch_id,))
                batch = cursor.fetchone()
                cursor.close()
                conn.close()
                if batch:
                    return dict(batch)
            except Exception as e:
                print(f"Error querying Postgres for batch: {e}")
                
        db = load_db()
        return db.get("batches", {}).get(batch_id)

    @staticmethod
    def register_file(batch_id: str, file_type: str, file_name: str, file_path: str):
        file_id = f"file_{uuid.uuid4().hex[:8]}"
        
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM app_files WHERE batch_id = %s AND file_type = %s", (batch_id, file_type))
                cursor.execute("INSERT INTO app_files (id, batch_id, file_type, file_name, file_path) VALUES (%s, %s, %s, %s, %s)",
                               (file_id, batch_id, file_type, file_name, file_path))
                conn.commit()
                cursor.close()
                conn.close()
                return
            except Exception as e:
                print(f"Error registering file in Postgres: {e}")
                if conn: conn.rollback()
                
        db = load_db()
        
        # Remove old entry if exists for same batch and type
        files_to_remove = []
        for fid, f in db.get("files", {}).items():
            if f["batch_id"] == batch_id and f["file_type"] == file_type:
                files_to_remove.append(fid)
        for fid in files_to_remove:
            del db["files"][fid]
            
        db["files"][file_id] = {
            "id": file_id,
            "batch_id": batch_id,
            "file_type": file_type,
            "file_name": file_name,
            "file_path": file_path
        }
        save_db(db)
