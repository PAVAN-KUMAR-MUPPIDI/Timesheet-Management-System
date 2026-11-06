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
    Fully normalized 3NF relational schema:
    - dbo.Roles
    - dbo.Teams
    - dbo.Users (Unified managers & employees with RoleId, TeamId, ManagerId)
    - dbo.TaskTypes
    - dbo.AiTools
    - dbo.Priorities
    - dbo.TaskStatuses
    - dbo.TimesheetEntries (Strictly normalized, referencing foreign keys without redundant columns)
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

            # 1. Load Users (joining Roles and Teams for human-readable labels)
            cur.execute("""
                SELECT 
                    u.UserId, u.Username, u.Email, u.PasswordHash, u.PlainPasswordHint,
                    LOWER(r.RoleName) AS RoleName, u.Name, u.Designation, u.EmployeeId, u.IsActive,
                    COALESCE(t.TeamName, 'Frontend') AS TeamName, u.TeamId, u.ManagerId
                FROM dbo.Users u
                JOIN dbo.Roles r ON u.RoleId = r.RoleId
                LEFT JOIN dbo.Teams t ON u.TeamId = t.TeamId
                WHERE u.IsActive = 1
                ORDER BY u.UserId
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
                    "isActive": bool(r[9]),
                    "team": r[10] or "",
                    "teamId": r[11],
                    "managerId": r[12]
                })
            self.users = users_list

            # 2. Derive Employees from dbo.Users (where Role is Employee or EmployeeId starts with E)
            self.employees = [
                {
                    "id": u["employeeId"],
                    "name": u["name"],
                    "email": u["email"],
                    "team": u["team"],
                    "designation": u["designation"],
                    "managerId": u.get("managerId") or "M01"
                }
                for u in self.users
                if (u.get("role") == "employee" or (u.get("employeeId") and u["employeeId"].startswith("E"))) and u.get("employeeId")
            ]

            # 3. Load Dedicated Reference Data
            ref_data: Dict[str, Any] = {
                'taskTypes': [],
                'priorities': [],
                'statuses': [],
                'aiTools': [],
                'projects': [],
                'modules': [],
                'teams': []
            }

            # TaskTypes
            cur.execute("SELECT TaskTypeName, Status FROM dbo.TaskTypes ORDER BY TaskTypeId")
            ref_data['taskTypes'] = [{'name': r[0], 'status': r[1]} for r in cur.fetchall()]

            # AiTools
            cur.execute("SELECT ToolName, Status FROM dbo.AiTools ORDER BY AiToolId")
            ref_data['aiTools'] = [{'name': r[0], 'status': r[1]} for r in cur.fetchall()]

            # Priorities
            cur.execute("SELECT PriorityName, Status FROM dbo.Priorities ORDER BY PriorityId")
            ref_data['priorities'] = [{'name': r[0], 'status': r[1]} for r in cur.fetchall()]

            # TaskStatuses
            cur.execute("SELECT StatusName, Status FROM dbo.TaskStatuses ORDER BY TaskStatusId")
            ref_data['statuses'] = [{'name': r[0], 'status': r[1]} for r in cur.fetchall()]

            # Teams
            cur.execute("SELECT TeamName, CASE WHEN IsActive=1 THEN 'Active' ELSE 'Inactive' END FROM dbo.Teams ORDER BY TeamId")
            ref_data['teams'] = [r[0] for r in cur.fetchall()]

            # Projects (distinct from TimesheetEntries)
            cur.execute("SELECT DISTINCT ProjectName FROM dbo.TimesheetEntries WHERE ProjectName IS NOT NULL AND ProjectName != '' ORDER BY ProjectName")
            ref_data['projects'] = [r[0] for r in cur.fetchall()]

            # Modules (distinct from TimesheetEntries)
            cur.execute("SELECT DISTINCT ModuleName FROM dbo.TimesheetEntries WHERE ModuleName IS NOT NULL AND ModuleName != '' ORDER BY ModuleName")
            ref_data['modules'] = [r[0] for r in cur.fetchall()]

            self.reference_data = ref_data

            # 4. Load Normalized Timesheet Entries (joining reference tables to resolve display names)
            cur.execute("""
                SELECT 
                    te.TimesheetId, te.EntryCode, te.EmployeeId, te.WorkDate, te.MonthKey, 
                    te.ProjectName, te.ModuleName, te.TaskTypeId, COALESCE(tt.TaskTypeName, 'Other') AS TaskTypeName, te.TaskDetails, 
                    te.PriorityId, COALESCE(p.PriorityName, 'Medium') AS PriorityName, 
                    te.TaskStatusId, COALESCE(ts.StatusName, 'Completed') AS StatusName, 
                    te.PlannedHours, te.ActualHours, te.AiHours, te.ManualHours, 
                    te.AiToolId, COALESCE(at.ToolName, 'None') AS ToolName, 
                    te.Notes, te.EntryState, te.SubmittedAt, te.IsDuplicate, te.IsIncomplete
                FROM dbo.TimesheetEntries te
                LEFT JOIN dbo.TaskTypes tt ON te.TaskTypeId = tt.TaskTypeId
                LEFT JOIN dbo.Priorities p ON te.PriorityId = p.PriorityId
                LEFT JOIN dbo.TaskStatuses ts ON te.TaskStatusId = ts.TaskStatusId
                LEFT JOIN dbo.AiTools at ON te.AiToolId = at.AiToolId
                ORDER BY te.TimesheetId
            """)
            entries_list = []
            nums = []
            for r in cur.fetchall():
                code = str(r[1])
                if code.startswith('T') and code[1:].isdigit():
                    nums.append(int(code[1:]))

                wdate = r[3]
                date_str = wdate.strftime("%Y-%m-%d") if isinstance(wdate, (date, datetime)) else str(wdate)
                
                sub_at = r[22]
                sub_str = sub_at.strftime("%Y-%m-%dT%H:%M") if isinstance(sub_at, (date, datetime)) else (str(sub_at) if sub_at else "")

                planned = float(r[14] or 0)
                actual = float(r[15] or 0)
                ai_hours = float(r[16] or 0)
                manual = float(r[17]) if r[17] is not None else max(0.0, actual - ai_hours)

                entry = {
                    "id": code,
                    "empId": r[2],
                    "date": date_str,
                    "month": r[4],
                    "project": r[5] or "",
                    "module": r[6] or "",
                    "taskType": r[8] or "Other",
                    "taskTypeId": r[7],
                    "details": r[9] or "",
                    "taskDetails": r[9] or "",
                    "priority": r[11] or "Medium",
                    "priorityId": r[10],
                    "status": r[13] or "Completed",
                    "statusId": r[12],
                    "planned": planned,
                    "actual": actual,
                    "aiHours": ai_hours,
                    "manual": manual,
                    "tool": r[19] or "None",
                    "aiTool": r[19] or "None",
                    "aiToolId": r[18],
                    "notes": r[20] or "",
                    "state": r[21] or "Submitted",
                    "submittedAt": sub_str,
                    "createdAt": int(code[1:]) if code.startswith('T') and code[1:].isdigit() else 1,
                    "_dup": bool(r[23]),
                    "_inc": bool(r[24])
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

    def _get_lookup_maps(self, cur) -> tuple:
        """Helper to get name-to-id lookup maps for foreign keys."""
        cur.execute("SELECT TaskTypeId, TaskTypeName FROM dbo.TaskTypes")
        tt_map = {row[1].strip().lower(): row[0] for row in cur.fetchall()}

        cur.execute("SELECT PriorityId, PriorityName FROM dbo.Priorities")
        p_map = {row[1].strip().lower(): row[0] for row in cur.fetchall()}

        cur.execute("SELECT TaskStatusId, StatusName FROM dbo.TaskStatuses")
        s_map = {row[1].strip().lower(): row[0] for row in cur.fetchall()}

        cur.execute("SELECT AiToolId, ToolName FROM dbo.AiTools")
        at_map = {row[1].strip().lower(): row[0] for row in cur.fetchall()}

        return tt_map, p_map, s_map, at_map

    def save_data(self):
        """Persists additions, modifications, and deletions in self.entries to SQL Server."""
        conn = self._get_connection()
        if not conn:
            logger.error("Could not obtain connection to SQL Server for saving.")
            return

        try:
            cur = conn.cursor()
            tt_map, p_map, s_map, at_map = self._get_lookup_maps(cur)

            current_ids = set(e['id'] for e in self.entries)
            persisted_ids = set(self._persisted_entries.keys())

            # 1. Handle Deletions
            deleted_ids = list(persisted_ids - current_ids)
            if deleted_ids:
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
                
                task_details = str(e.get("details") or e.get("taskDetails") or "")
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

                # Foreign Key Lookups
                tt_name = str(e.get("taskType", "Other")).strip().lower()
                tt_id = tt_map.get(tt_name, 16) # Default to 16: Other

                p_name = str(e.get("priority", "Medium")).strip().lower()
                p_id = p_map.get(p_name, 2) # Default to 2: Medium

                s_name = str(e.get("status", "Completed")).strip().lower()
                s_id = s_map.get(s_name, 3) # Default to 3: Completed

                tool_name = str(e.get("aiTool", e.get("tool", "None"))).strip().lower()
                at_id = at_map.get(tool_name, at_map.get("n/a", 14))

                # Check if new
                if eid not in self._persisted_entries:
                    insert_rows.append((
                        eid,
                        e.get("empId", "E01"),
                        e.get("date", "2026-10-01"),
                        e.get("month", str(e.get("date", "2026-10-01"))[:7]),
                        e.get("project", ""),
                        e.get("module", ""),
                        tt_id,
                        task_details,
                        p_id,
                        s_id,
                        planned_val,
                        actual_val,
                        ai_hours_val,
                        manual_val,
                        at_id,
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
                        tt_id,
                        task_details,
                        p_id,
                        s_id,
                        planned_val,
                        actual_val,
                        ai_hours_val,
                        manual_val,
                        at_id,
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
                        ProjectName, ModuleName, TaskTypeId, TaskDetails, PriorityId, 
                        TaskStatusId, PlannedHours, ActualHours, AiHours, ManualHours, 
                        AiToolId, Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, insert_rows)

            if update_rows:
                cur.executemany("""
                    UPDATE dbo.TimesheetEntries SET
                        WorkDate=?, MonthKey=?, ProjectName=?, ModuleName=?, TaskTypeId=?,
                        TaskDetails=?, PriorityId=?, TaskStatusId=?, PlannedHours=?, ActualHours=?,
                        AiHours=?, ManualHours=?, AiToolId=?, Notes=?, EntryState=?,
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
        """Add or update an employee user account in dbo.Users in SQL Server."""
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
            cur.execute("SELECT TeamId FROM dbo.Teams WHERE LOWER(TeamName) = ?", (clean_team.lower(),))
            t_row = cur.fetchone()
            team_id = t_row[0] if t_row else 1

            # Check if user already exists
            cur.execute("SELECT UserId, EmployeeId FROM dbo.Users WHERE LOWER(Email) = ? OR LOWER(Username) = ?", (clean_email, username))
            u_row = cur.fetchone()

            if u_row:
                emp_id = u_row[1]
                cur.execute("""
                    UPDATE dbo.Users 
                    SET Name=?, TeamId=?, Designation=?, PasswordHash=?, PlainPasswordHint=?, IsActive=1
                    WHERE UserId=?
                """, (clean_name, team_id, clean_desig, pwd_hash, clean_pwd, u_row[0]))
            else:
                nums = [
                    int(e['id'][1:]) for e in self.employees
                    if str(e.get('id', '')).startswith('E') and str(e.get('id', ''))[1:].isdigit()
                ]
                next_num = (max(nums) + 1) if nums else (len(self.employees) + 1)
                emp_id = f"E{next_num:02d}"

                cur.execute("""
                    INSERT INTO dbo.Users (
                        EmployeeId, Username, Email, PasswordHash, PlainPasswordHint, 
                        RoleId, Name, TeamId, Designation, ManagerId, IsActive
                    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'M01', 1)
                """, (emp_id, username, clean_email, pwd_hash, clean_pwd, clean_name, team_id, clean_desig))

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
        if target in ["manager", "m01", "mohan", "mohan@company.com"]:
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
                    SELECT 
                        u.UserId, u.Username, u.Email, u.PasswordHash, u.PlainPasswordHint,
                        LOWER(r.RoleName) AS RoleName, u.Name, u.Designation, u.EmployeeId, u.IsActive,
                        COALESCE(t.TeamName, 'Frontend') AS TeamName, u.TeamId, u.ManagerId
                    FROM dbo.Users u
                    JOIN dbo.Roles r ON u.RoleId = r.RoleId
                    LEFT JOIN dbo.Teams t ON u.TeamId = t.TeamId
                    WHERE u.IsActive = 1 AND (LOWER(u.Email) = ? OR LOWER(u.Username) = ? OR LOWER(u.EmployeeId) = ?)
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
                        "isActive": bool(r[9]),
                        "team": r[10] or "",
                        "teamId": r[11],
                        "managerId": r[12]
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
            if category == 'taskTypes':
                cur.execute("SELECT TaskTypeId FROM dbo.TaskTypes WHERE LOWER(TaskTypeName)=?", (val.lower(),))
                if not cur.fetchone():
                    cur.execute("INSERT INTO dbo.TaskTypes (TaskTypeName, Status, IsActive) VALUES (?, ?, 1)", (val, status))
            elif category == 'aiTools':
                cur.execute("SELECT AiToolId FROM dbo.AiTools WHERE LOWER(ToolName)=?", (val.lower(),))
                if not cur.fetchone():
                    cur.execute("INSERT INTO dbo.AiTools (ToolName, Status, IsActive) VALUES (?, ?, 1)", (val, status))
            elif category == 'priorities':
                cur.execute("SELECT PriorityId FROM dbo.Priorities WHERE LOWER(PriorityName)=?", (val.lower(),))
                if not cur.fetchone():
                    cur.execute("INSERT INTO dbo.Priorities (PriorityName, Status, IsActive) VALUES (?, ?, 1)", (val, status))
            elif category == 'statuses':
                cur.execute("SELECT TaskStatusId FROM dbo.TaskStatuses WHERE LOWER(StatusName)=?", (val.lower(),))
                if not cur.fetchone():
                    cur.execute("INSERT INTO dbo.TaskStatuses (StatusName, Status, IsActive) VALUES (?, ?, 1)", (val, status))
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
            if category == 'taskTypes':
                cur.execute("SELECT Status FROM dbo.TaskTypes WHERE LOWER(TaskTypeName)=?", (val.lower(),))
                r = cur.fetchone()
                if r:
                    new_status = target_status if target_status else ('Inactive' if r[0] == 'Active' else 'Active')
                    cur.execute("UPDATE dbo.TaskTypes SET Status=? WHERE LOWER(TaskTypeName)=?", (new_status, val.lower()))
            elif category == 'aiTools':
                cur.execute("SELECT Status FROM dbo.AiTools WHERE LOWER(ToolName)=?", (val.lower(),))
                r = cur.fetchone()
                if r:
                    new_status = target_status if target_status else ('Inactive' if r[0] == 'Active' else 'Active')
                    cur.execute("UPDATE dbo.AiTools SET Status=? WHERE LOWER(ToolName)=?", (new_status, val.lower()))
            elif category == 'priorities':
                cur.execute("SELECT Status FROM dbo.Priorities WHERE LOWER(PriorityName)=?", (val.lower(),))
                r = cur.fetchone()
                if r:
                    new_status = target_status if target_status else ('Inactive' if r[0] == 'Active' else 'Active')
                    cur.execute("UPDATE dbo.Priorities SET Status=? WHERE LOWER(PriorityName)=?", (new_status, val.lower()))
            elif category == 'statuses':
                cur.execute("SELECT Status FROM dbo.TaskStatuses WHERE LOWER(StatusName)=?", (val.lower(),))
                r = cur.fetchone()
                if r:
                    new_status = target_status if target_status else ('Inactive' if r[0] == 'Active' else 'Active')
                    cur.execute("UPDATE dbo.TaskStatuses SET Status=? WHERE LOWER(StatusName)=?", (new_status, val.lower()))
            elif category == 'teams':
                cur.execute("SELECT IsActive FROM dbo.Teams WHERE LOWER(TeamName)=?", (val.lower(),))
                r = cur.fetchone()
                if r:
                    new_act = 0 if r[0] else 1
                    cur.execute("UPDATE dbo.Teams SET IsActive=? WHERE LOWER(TeamName)=?", (new_act, val.lower()))
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
            if category == 'taskTypes':
                try:
                    cur.execute("DELETE FROM dbo.TaskTypes WHERE LOWER(TaskTypeName)=?", (val.lower(),))
                except pyodbc.IntegrityError:
                    cur.execute("UPDATE dbo.TaskTypes SET IsActive=0, Status='Inactive' WHERE LOWER(TaskTypeName)=?", (val.lower(),))
            elif category == 'aiTools':
                try:
                    cur.execute("DELETE FROM dbo.AiTools WHERE LOWER(ToolName)=?", (val.lower(),))
                except pyodbc.IntegrityError:
                    cur.execute("UPDATE dbo.AiTools SET IsActive=0, Status='Inactive' WHERE LOWER(ToolName)=?", (val.lower(),))
            elif category == 'priorities':
                try:
                    cur.execute("DELETE FROM dbo.Priorities WHERE LOWER(PriorityName)=?", (val.lower(),))
                except pyodbc.IntegrityError:
                    cur.execute("UPDATE dbo.Priorities SET IsActive=0, Status='Inactive' WHERE LOWER(PriorityName)=?", (val.lower(),))
            elif category == 'statuses':
                try:
                    cur.execute("DELETE FROM dbo.TaskStatuses WHERE LOWER(StatusName)=?", (val.lower(),))
                except pyodbc.IntegrityError:
                    cur.execute("UPDATE dbo.TaskStatuses SET IsActive=0, Status='Inactive' WHERE LOWER(StatusName)=?", (val.lower(),))
            elif category == 'teams':
                try:
                    cur.execute("DELETE FROM dbo.Teams WHERE LOWER(TeamName)=?", (val.lower(),))
                except pyodbc.IntegrityError:
                    cur.execute("UPDATE dbo.Teams SET IsActive=0 WHERE LOWER(TeamName)=?", (val.lower(),))
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
