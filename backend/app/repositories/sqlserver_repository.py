import copy
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any, Optional

import pyodbc
from app.db.connection import create_db_connection
from app.core.security import get_password_hash

logger = logging.getLogger("app.repository.sqlserver")

def _safe_float(val: Any, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

class SQLServerRepository:
    """
    Production repository layer backed by Microsoft SQL Server (TeamProductivityHub).
    Handles dynamic querying, inserts, updates, and deletes directly against the database.
    """
    def __init__(self):
        self.users: List[Dict[str, Any]] = []
        self.employees: List[Dict[str, Any]] = []
        self.entries: List[Dict[str, Any]] = []
        self.reference_data: Dict[str, Any] = {}
        self.seq: int = 100
        self._persisted_entries: Dict[str, Dict[str, Any]] = {}
        self.load_data()

    def _get_connection(self) -> Optional[pyodbc.Connection]:
        return create_db_connection()

    def _normalize_items(self, raw_list: Any) -> List[Dict[str, Any]]:
        if not isinstance(raw_list, list):
            return []
        normalized = []
        for x in raw_list:
            if isinstance(x, dict):
                normalized.append({
                    'name': str(x.get('name', '')).strip(),
                    'status': x.get('status', 'Active')
                })
            elif isinstance(x, str):
                normalized.append({
                    'name': x.strip(),
                    'status': 'Active'
                })
        return normalized

    def load_data(self):
        """Loads all entities directly from SQL Server tables into memory."""
        conn = self._get_connection()
        if not conn:
            logger.error("Could not obtain connection to SQL Server.")
            return

        try:
            cur = conn.cursor()

            # 1. Load Users
            cur.execute("""
                SELECT UserId, Username, Email, PasswordHash, PlainPasswordHint, Role, Name, Designation, EmployeeId, IsActive
                FROM dbo.Users
                WHERE IsActive = 1
                ORDER BY UserId
            """)
            users_list = []
            for r in cur.fetchall():
                users_list.append({
                    "id": r[0],
                    "username": r[1] or "",
                    "email": r[2] or "",
                    "password": r[4] or r[3] or "",
                    "passwordHash": r[3] or "",
                    "role": r[5] or "employee",
                    "name": r[6] or "",
                    "designation": r[7] or "",
                    "employeeId": r[8],
                    "isActive": bool(r[9])
                })
            self.users = users_list

            # 2. Load Employees
            cur.execute("""
                SELECT EmployeeId, Name, Email, TeamName, Designation, ManagerId, IsActive
                FROM dbo.Employees
                WHERE IsActive = 1
                ORDER BY EmployeeId
            """)
            emp_list = []
            for r in cur.fetchall():
                emp_list.append({
                    "id": r[0],
                    "name": r[1] or "",
                    "email": r[2] or "",
                    "team": r[3] or "",
                    "designation": r[4] or "",
                    "managerId": r[5]
                })
            self.employees = emp_list

            # 3. Load Reference Data & Controlled Fields
            ref_data: Dict[str, Any] = {
                'taskTypes': [],
                'priorities': [],
                'statuses': [],
                'aiTools': [],
                'projects': [],
                'modules': [],
                'teams': []
            }

            cur.execute("SELECT Category, Value, Status FROM dbo.ControlledFields ORDER BY ControlledFieldId")
            for r in cur.fetchall():
                cat = r[0]
                val = r[1]
                stat = r[2]
                if cat in ('projects', 'modules', 'teams'):
                    if cat not in ref_data:
                        ref_data[cat] = []
                    ref_data[cat].append(val)
                else:
                    if cat not in ref_data:
                        ref_data[cat] = []
                    ref_data[cat].append({'name': val, 'status': stat})

            # Augment projects, modules, teams from their master tables
            cur.execute("SELECT ProjectName FROM dbo.Projects WHERE IsActive = 1 ORDER BY ProjectName")
            db_projects = [r[0] for r in cur.fetchall()]
            if db_projects:
                ref_data['projects'] = list(dict.fromkeys(db_projects + ref_data.get('projects', [])))

            cur.execute("SELECT ModuleName FROM dbo.Modules WHERE IsActive = 1 ORDER BY ModuleName")
            db_modules = [r[0] for r in cur.fetchall()]
            if db_modules:
                ref_data['modules'] = list(dict.fromkeys(db_modules + ref_data.get('modules', [])))

            cur.execute("SELECT TeamName FROM dbo.Teams WHERE IsActive = 1 ORDER BY TeamName")
            db_teams = [r[0] for r in cur.fetchall()]
            if db_teams:
                ref_data['teams'] = list(dict.fromkeys(db_teams + ref_data.get('teams', [])))

            self.reference_data = ref_data

            # 4. Load Timesheet Entries
            cur.execute("""
                SELECT 
                    TimesheetId, EntryCode, EmployeeId, WorkDate, MonthKey, 
                    ProjectName, ModuleName, TaskTypeName, TaskDetails, Priority, 
                    TaskStatus, PlannedHours, ActualHours, AiHours, ManualHours, 
                    AiToolName, Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
                FROM dbo.TimesheetEntries
                ORDER BY TimesheetId
            """)
            entries_list = []
            nums = []
            for r in cur.fetchall():
                code = str(r[1])
                if code.startswith('T') and code[1:].isdigit():
                    nums.append(int(code[1:]))

                wdate = r[3]
                date_str = wdate.strftime("%Y-%m-%d") if isinstance(wdate, (date, datetime)) else str(wdate)
                
                sub_at = r[18]
                sub_str = sub_at.strftime("%Y-%m-%dT%H:%M") if isinstance(sub_at, (date, datetime)) else (str(sub_at) if sub_at else "")

                planned = float(r[11] or 0)
                actual = float(r[12] or 0)
                ai_hours = float(r[13] or 0)
                manual = float(r[14]) if r[14] is not None else max(0.0, actual - ai_hours)

                entry = {
                    "id": code,
                    "empId": r[2],
                    "date": date_str,
                    "month": r[4],
                    "project": r[5] or "",
                    "module": r[6] or "",
                    "taskType": r[7] or "",
                    "details": r[8] or "",
                    "taskDetails": r[8] or "",
                    "priority": r[9] or "Medium",
                    "status": r[10] or "Completed",
                    "planned": planned,
                    "actual": actual,
                    "aiHours": ai_hours,
                    "manual": manual,
                    "tool": r[15] or "N/A",
                    "aiTool": r[15] or "N/A",
                    "notes": r[16] or "",
                    "state": r[17] or "Submitted",
                    "submittedAt": sub_str,
                    "createdAt": int(code[1:]) if code.startswith('T') and code[1:].isdigit() else 1,
                    "_dup": bool(r[19]),
                    "_inc": bool(r[20])
                }
                entries_list.append(entry)

            self.entries = entries_list
            self.seq = max(nums) if nums else 100
            self._persisted_entries = {e['id']: copy.deepcopy(e) for e in self.entries}

        except Exception as exc:
            logger.exception("Error loading data from SQL Server: %s", exc)
        finally:
            conn.close()

    _load_seed_data = load_data

    def save_data(self):
        """Persists additions, modifications, and deletions in self.entries to SQL Server."""
        conn = self._get_connection()
        if not conn:
            logger.error("Could not obtain connection to SQL Server for saving.")
            return

        try:
            cur = conn.cursor()
            current_ids = set(e['id'] for e in self.entries)
            persisted_ids = set(self._persisted_entries.keys())

            # 1. Handle Deletions
            deleted_ids = list(persisted_ids - current_ids)
            if deleted_ids:
                # Batch delete in chunks of 500
                chunk_size = 500
                for i in range(0, len(deleted_ids), chunk_size):
                    chunk = deleted_ids[i:i + chunk_size]
                    placeholders = ",".join("?" for _ in chunk)
                    cur.execute(f"DELETE FROM dbo.TimesheetEntries WHERE EntryCode IN ({placeholders})", chunk)

            # 2. Handle Insertions and Updates
            insert_rows = []
            update_rows = []

            for e in self.entries:
                eid = e.get('id')
                if not eid:
                    continue
                
                if "details" in e:
                    task_details = str(e.get("details") or "")
                elif "taskDetails" in e:
                    task_details = str(e.get("taskDetails") or "")
                else:
                    task_details = ""
                e["details"] = task_details
                e["taskDetails"] = task_details
                
                planned_val = _safe_float(e.get("planned"), 0.0)
                actual_val = _safe_float(e.get("actual"), 0.0)
                ai_hours_val = _safe_float(e.get("aiHours"), 0.0)
                manual_val = _safe_float(e.get("manual"), max(0.0, actual_val - ai_hours_val))

                sub_at_val = None
                if e.get("submittedAt"):
                    try:
                        sub_at_val = datetime.fromisoformat(str(e["submittedAt"]).replace("Z", ""))
                    except Exception:
                        sub_at_val = None

                # Check if new
                if eid not in self._persisted_entries:
                    insert_rows.append((
                        eid,
                        e.get("empId", "E01"),
                        e.get("date", "2026-10-01"),
                        e.get("month", str(e.get("date", "2026-10-01"))[:7]),
                        e.get("project", ""),
                        e.get("module", ""),
                        e.get("taskType", "Development"),
                        task_details,
                        e.get("priority", "Medium"),
                        e.get("status", "Completed"),
                        planned_val,
                        actual_val,
                        ai_hours_val,
                        manual_val,
                        e.get("aiTool", e.get("tool", "N/A")),
                        e.get("notes", ""),
                        e.get("state", "Submitted"),
                        sub_at_val,
                        1 if e.get("_dup", False) else 0,
                        1 if e.get("_inc", False) else 0
                    ))
                elif e != self._persisted_entries[eid]:
                    update_rows.append((
                        e.get("date", "2026-10-01"),
                        e.get("month", str(e.get("date", "2026-10-01"))[:7]),
                        e.get("project", ""),
                        e.get("module", ""),
                        e.get("taskType", "Development"),
                        task_details,
                        e.get("priority", "Medium"),
                        e.get("status", "Completed"),
                        planned_val,
                        actual_val,
                        ai_hours_val,
                        manual_val,
                        e.get("aiTool", e.get("tool", "N/A")),
                        e.get("notes", ""),
                        e.get("state", "Submitted"),
                        sub_at_val,
                        1 if e.get("_dup", False) else 0,
                        1 if e.get("_inc", False) else 0,
                        eid
                    ))

            if insert_rows:
                cur.executemany("""
                    INSERT INTO dbo.TimesheetEntries (
                        EntryCode, EmployeeId, WorkDate, MonthKey, 
                        ProjectName, ModuleName, TaskTypeName, TaskDetails, Priority, 
                        TaskStatus, PlannedHours, ActualHours, AiHours, ManualHours, 
                        AiToolName, Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, insert_rows)

            if update_rows:
                cur.executemany("""
                    UPDATE dbo.TimesheetEntries SET
                        WorkDate=?, MonthKey=?, ProjectName=?, ModuleName=?, TaskTypeName=?,
                        TaskDetails=?, Priority=?, TaskStatus=?, PlannedHours=?, ActualHours=?,
                        AiHours=?, ManualHours=?, AiToolName=?, Notes=?, EntryState=?,
                        SubmittedAt=?, IsDuplicate=?, IsIncomplete=?, UpdatedAt=SYSUTCDATETIME()
                    WHERE EntryCode=?
                """, update_rows)

            self._persisted_entries = {e['id']: copy.deepcopy(e) for e in self.entries}

        except Exception as exc:
            logger.exception("Error saving timesheet entries to SQL Server: %s", exc)
        finally:
            conn.close()

    save_seed_data = save_data

    def get_employees(self, team: str = "all") -> List[Dict[str, Any]]:
        self.load_data()
        if team and team != "all":
            return [e for e in self.employees if e.get('team') == team]
        return self.employees

    def get_employee_by_id(self, emp_id: str) -> Optional[Dict[str, Any]]:
        self.load_data()
        return next((e for e in self.employees if e.get('id') == emp_id), None)

    def add_employee(
        self,
        name: str,
        email: str,
        team: str,
        designation: str,
        password: Optional[str] = None
    ) -> Dict[str, Any]:
        """Add or update an employee and their corresponding user login in SQL Server."""
        self.load_data()
        clean_email = email.strip().lower()
        clean_name = name.strip()
        clean_team = team.strip()
        clean_desig = designation.strip()

        first_name = clean_name.split()[0].lower() if clean_name else "name"
        default_pwd = f"{first_name}@1234"
        clean_pwd = password.strip() if (password and password.strip()) else default_pwd
        pwd_hash = get_password_hash(clean_pwd)

        username = clean_email.split('@')[0] if '@' in clean_email else clean_name.lower().replace(' ', '.')

        conn = self._get_connection()
        if not conn:
            raise RuntimeError("Database connection not available")

        try:
            cur = conn.cursor()

            # Find TeamId
            cur.execute("SELECT TeamId FROM dbo.Teams WHERE TeamName = ?", (clean_team,))
            t_row = cur.fetchone()
            team_id = t_row[0] if t_row else 1

            # Check if employee exists
            cur.execute("SELECT EmployeeId FROM dbo.Employees WHERE LOWER(Email) = ?", (clean_email,))
            emp_row = cur.fetchone()

            if emp_row:
                emp_id = emp_row[0]
                cur.execute("""
                    UPDATE dbo.Employees 
                    SET Name=?, TeamId=?, TeamName=?, Designation=?, IsActive=1
                    WHERE EmployeeId=?
                """, (clean_name, team_id, clean_team, clean_desig, emp_id))
            else:
                nums = [
                    int(e['id'][1:]) for e in self.employees
                    if str(e.get('id', '')).startswith('E') and str(e.get('id', ''))[1:].isdigit()
                ]
                next_num = (max(nums) + 1) if nums else (len(self.employees) + 1)
                emp_id = f"E{next_num:02d}"
                cur.execute("""
                    INSERT INTO dbo.Employees (EmployeeId, Name, Email, TeamId, TeamName, Designation, IsActive)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                """, (emp_id, clean_name, clean_email, team_id, clean_team, clean_desig))

            # Upsert User
            cur.execute("SELECT UserId FROM dbo.Users WHERE LOWER(Email) = ? OR LOWER(Username) = ?", (clean_email, username))
            u_row = cur.fetchone()
            if u_row:
                user_id = u_row[0]
                cur.execute("""
                    UPDATE dbo.Users
                    SET Name=?, Designation=?, EmployeeId=?, PasswordHash=?, PlainPasswordHint=?, IsActive=1
                    WHERE UserId=?
                """, (clean_name, clean_desig, emp_id, pwd_hash, clean_pwd, user_id))
            else:
                cur.execute("""
                    INSERT INTO dbo.Users (Username, Email, PasswordHash, PlainPasswordHint, RoleId, Role, Name, Designation, EmployeeId, IsActive)
                    VALUES (?, ?, ?, ?, 1, 'employee', ?, ?, ?, 1)
                """, (username, clean_email, pwd_hash, clean_pwd, clean_name, clean_desig, emp_id))

        finally:
            conn.close()

        self.load_data()
        return self.get_employee_by_id(emp_id) or {
            "id": emp_id,
            "name": clean_name,
            "email": clean_email,
            "team": clean_team,
            "designation": clean_desig
        }

    def get_users(self) -> List[Dict[str, Any]]:
        self.load_data()
        return self.users

    def update_user_profile(
        self,
        identifier: str,
        name: Optional[str] = None,
        designation: Optional[str] = None,
        password: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        user = self.find_user(identifier)
        if not user:
            return None

        conn = self._get_connection()
        if not conn:
            return None

        try:
            cur = conn.cursor()
            user_id = user["id"]
            new_name = name.strip() if (name and name.strip()) else user.get("name")
            new_desig = designation.strip() if (designation and designation.strip()) else user.get("designation")
            
            if password and password.strip():
                new_pwd = password.strip()
                new_hash = get_password_hash(new_pwd)
                cur.execute("""
                    UPDATE dbo.Users
                    SET Name=?, Designation=?, PasswordHash=?, PlainPasswordHint=?
                    WHERE UserId=?
                """, (new_name, new_desig, new_hash, new_pwd, user_id))
            else:
                cur.execute("""
                    UPDATE dbo.Users
                    SET Name=?, Designation=?
                    WHERE UserId=?
                """, (new_name, new_desig, user_id))

            if user.get("employeeId"):
                cur.execute("""
                    UPDATE dbo.Employees
                    SET Name=?, Designation=?
                    WHERE EmployeeId=?
                """, (new_name, new_desig, user["employeeId"]))

        finally:
            conn.close()

        self.load_data()
        return self.find_user(identifier)

    def find_user(self, identity: str) -> Optional[Dict[str, Any]]:
        if not identity:
            return None
        target = str(identity).lower().strip()

        if not self.users:
            self.load_data()

        # Manager shortcuts
        if target in ["manager", "mohan", "mohan@company.com"]:
            mgr = next((u for u in self.users if u.get("role") == "manager"), None)
            if mgr:
                return mgr

        # Employee shortcuts
        if target in ["employee", "e01", "chandrika", "chandrika.t", "chandrika.t@company.com"]:
            emp = next((u for u in self.users if u.get("employeeId") == "E01"), None)
            if emp:
                return emp

        # 1. Exact Email, Username, or EmployeeId
        for u in self.users:
            if u.get('email', '').lower() == target:
                return u
            if u.get('username', '').lower() == target:
                return u
            if u.get('employeeId') and str(u.get('employeeId')).lower() == target:
                return u

        # 2. Case-insensitive substring/name search
        for u in self.users:
            if (target in u.get('email', '').lower() or
                target in u.get('username', '').lower() or
                target in u.get('name', '').lower()):
                return u

        # 3. Direct DB fallback query if not in cache
        conn = self._get_connection()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("""
                    SELECT UserId, Username, Email, PasswordHash, PlainPasswordHint, Role, Name, Designation, EmployeeId, IsActive
                    FROM dbo.Users
                    WHERE IsActive = 1 AND (LOWER(Email) = ? OR LOWER(Username) = ? OR LOWER(EmployeeId) = ?)
                """, (target, target, target))
                r = cur.fetchone()
                if r:
                    return {
                        "id": r[0],
                        "username": r[1] or "",
                        "email": r[2] or "",
                        "password": r[4] or r[3] or "",
                        "passwordHash": r[3] or "",
                        "role": r[5] or "employee",
                        "name": r[6] or "",
                        "designation": r[7] or "",
                        "employeeId": r[8],
                        "isActive": bool(r[9])
                    }
            except Exception:
                pass
            finally:
                conn.close()

        return None

    def get_controlled_fields(self) -> Dict[str, Any]:
        self.load_data()
        return {
            'taskTypes': self._normalize_items(self.reference_data.get('taskTypes', [])),
            'priorities': self._normalize_items(self.reference_data.get('priorities', [])),
            'statuses': self._normalize_items(self.reference_data.get('statuses', [])),
            'aiTools': self._normalize_items(self.reference_data.get('aiTools', [])),
            'projects': self.reference_data.get('projects', []),
            'modules': self.reference_data.get('modules', []),
            'teams': self.reference_data.get('teams', [])
        }

    def add_controlled_field(self, category: str, value: str, status: str = "Inactive") -> List[Dict[str, Any]]:
        val = str(value or '').strip()
        if not val:
            raise ValueError("Value cannot be blank")

        conn = self._get_connection()
        if not conn:
            raise RuntimeError("Database connection not available")

        try:
            cur = conn.cursor()
            cur.execute("SELECT ControlledFieldId FROM dbo.ControlledFields WHERE Category=? AND LOWER(Value)=?", (category, val.lower()))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO dbo.ControlledFields (Category, Value, Status)
                    VALUES (?, ?, ?)
                """, (category, val, status))

                if category == 'projects':
                    cur.execute("SELECT ProjectId FROM dbo.Projects WHERE LOWER(ProjectName)=?", (val.lower(),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO dbo.Projects (ProjectName, IsActive) VALUES (?, 1)", (val,))
                elif category == 'modules':
                    cur.execute("SELECT ModuleId FROM dbo.Modules WHERE LOWER(ModuleName)=?", (val.lower(),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO dbo.Modules (ModuleName, IsActive) VALUES (?, 1)", (val,))
                elif category == 'taskTypes':
                    cur.execute("SELECT TaskTypeId FROM dbo.TaskTypes WHERE LOWER(TaskTypeName)=?", (val.lower(),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO dbo.TaskTypes (TaskTypeName, Status, IsActive) VALUES (?, ?, 1)", (val, status))
                elif category == 'aiTools':
                    cur.execute("SELECT AiToolId FROM dbo.AiTools WHERE LOWER(ToolName)=?", (val.lower(),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO dbo.AiTools (ToolName, Status, IsActive) VALUES (?, ?, 1)", (val, status))
                elif category == 'teams':
                    cur.execute("SELECT TeamId FROM dbo.Teams WHERE LOWER(TeamName)=?", (val.lower(),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO dbo.Teams (TeamName, IsActive) VALUES (?, 1)", (val,))
        finally:
            conn.close()

        self.load_data()
        return self.reference_data.get(category, [])

    def toggle_controlled_status(self, category: str, value: str, target_status: Optional[str] = None) -> List[Dict[str, Any]]:
        val = str(value or '').strip()
        conn = self._get_connection()
        if not conn:
            return self.reference_data.get(category, [])

        try:
            cur = conn.cursor()
            cur.execute("SELECT Status FROM dbo.ControlledFields WHERE Category=? AND LOWER(Value)=?", (category, val.lower()))
            row = cur.fetchone()
            if row:
                current_status = row[0]
                new_status = target_status if target_status else ('Inactive' if current_status == 'Active' else 'Active')
                cur.execute("""
                    UPDATE dbo.ControlledFields
                    SET Status=?
                    WHERE Category=? AND LOWER(Value)=?
                """, (new_status, category, val.lower()))

                if category == 'taskTypes':
                    cur.execute("UPDATE dbo.TaskTypes SET Status=? WHERE LOWER(TaskTypeName)=?", (new_status, val.lower()))
                elif category == 'aiTools':
                    cur.execute("UPDATE dbo.AiTools SET Status=? WHERE LOWER(ToolName)=?", (new_status, val.lower()))
        finally:
            conn.close()

        self.load_data()
        return self.reference_data.get(category, [])

    def delete_controlled_field(self, category: str, value: str) -> List[Dict[str, Any]]:
        val = str(value or '').strip()
        conn = self._get_connection()
        if not conn:
            return self.reference_data.get(category, [])

        try:
            cur = conn.cursor()
            # 1. Delete from dbo.ControlledFields
            cur.execute("DELETE FROM dbo.ControlledFields WHERE Category=? AND LOWER(Value)=?", (category, val.lower()))

            # 2. Delete from corresponding master table if applicable
            if category == 'taskTypes':
                cur.execute("DELETE FROM dbo.TaskTypes WHERE LOWER(TaskTypeName)=?", (val.lower(),))
            elif category == 'aiTools':
                cur.execute("DELETE FROM dbo.AiTools WHERE LOWER(ToolName)=?", (val.lower(),))
            elif category == 'projects':
                cur.execute("DELETE FROM dbo.Projects WHERE LOWER(ProjectName)=?", (val.lower(),))
            elif category == 'modules':
                cur.execute("DELETE FROM dbo.Modules WHERE LOWER(ModuleName)=?", (val.lower(),))
            elif category == 'teams':
                cur.execute("DELETE FROM dbo.Teams WHERE LOWER(TeamName)=?", (val.lower(),))
        finally:
            conn.close()

        self.load_data()
        return self.reference_data.get(category, [])

NO_AI = ''

def _extract_active_names(items: Any) -> List[str]:
    res = []
    for x in (items or []):
        if isinstance(x, dict):
            name = str(x.get('name', '')).strip()
            if name and x.get('status') != 'Inactive':
                res.append(name)
        elif isinstance(x, str) and x.strip():
            res.append(x.strip())
    return res

# Active Production Database Repository
db = SQLServerRepository()
mock_db = db  # Aliased for backward compatibility

def create_repository() -> SQLServerRepository:
    return db

TOOLS = _extract_active_names(db.reference_data.get('aiTools', []))
STATUSES = _extract_active_names(db.reference_data.get('statuses', []))
PRIORITIES = _extract_active_names(db.reference_data.get('priorities', []))
PROJECTS = db.reference_data.get('projects', [])
MODULES = db.reference_data.get('modules', [])
TEAMS = db.reference_data.get('teams', [])
DEFAULT_TASK_TYPES = _extract_active_names(db.reference_data.get('taskTypes', []))
DEFAULT_AI_TOOLS = _extract_active_names(db.reference_data.get('aiTools', []))
DEFAULT_STATUSES = _extract_active_names(db.reference_data.get('statuses', []))
DEFAULT_PRIORITIES = _extract_active_names(db.reference_data.get('priorities', []))
DEFAULT_EMPLOYEES = db.employees
DEFAULT_USERS = db.users
