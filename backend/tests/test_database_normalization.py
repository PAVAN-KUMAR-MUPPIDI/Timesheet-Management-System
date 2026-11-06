import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.repositories.sqlserver_repository import db
from app.db.connection import create_db_connection

client = TestClient(app)

@pytest.fixture
def auth_manager():
    resp = client.post("/api/auth/login", json={"email": "mohan@company.com", "password": "mohan@1234"})
    assert resp.status_code == 200
    token_data = resp.json()
    csrf_token = token_data.get("csrf_token")
    headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    if csrf_token:
        headers["X-CSRF-Token"] = csrf_token
    return headers

def test_manager_has_m01_employee_id(auth_manager):
    resp = client.post("/api/auth/login", json={"email": "mohan@company.com", "password": "mohan@1234"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "manager"
    assert data["employee_id"] == "M01"

def test_dropped_tables_do_not_exist():
    cn = create_db_connection()
    assert cn is not None
    cur = cn.cursor()
    
    dropped_tables = [
        'TimesheetSubmissions',
        'ControlledFields',
        'Employees',
        'Modules',
        'Projects'
    ]
    for tbl in dropped_tables:
        cur.execute(f"SELECT OBJECT_ID('dbo.{tbl}', 'U')")
        result = cur.fetchone()[0]
        assert result is None, f"Table dbo.{tbl} should have been dropped but exists!"
    cn.close()

def test_priorities_and_taskstatuses_tables_exist():
    cn = create_db_connection()
    assert cn is not None
    cur = cn.cursor()
    
    cur.execute("SELECT OBJECT_ID('dbo.Priorities', 'U')")
    assert cur.fetchone()[0] is not None
    
    cur.execute("SELECT OBJECT_ID('dbo.TaskStatuses', 'U')")
    assert cur.fetchone()[0] is not None
    
    cur.execute("SELECT COUNT(*) FROM dbo.Priorities")
    assert cur.fetchone()[0] >= 4
    
    cur.execute("SELECT COUNT(*) FROM dbo.TaskStatuses")
    assert cur.fetchone()[0] >= 5
    cn.close()

def test_timesheetentries_no_redundant_columns():
    cn = create_db_connection()
    assert cn is not None
    cur = cn.cursor()
    
    cur.execute("SELECT TOP 1 * FROM dbo.TimesheetEntries")
    cols = [col[0].lower() for col in cur.description]
    
    # Must have normalized foreign key IDs
    assert 'priorityid' in cols
    assert 'taskstatusid' in cols
    assert 'tasktypeid' in cols
    assert 'aitoolid' in cols
    assert 'employeeid' in cols
    
    # Must NOT have redundant denormalized text columns
    assert 'priority' not in cols
    assert 'taskstatus' not in cols
    assert 'tasktypename' not in cols
    assert 'aitoolname' not in cols
    assert 'projectid' not in cols
    assert 'moduleid' not in cols
    cn.close()

def test_users_table_unified_and_no_redundant_columns():
    cn = create_db_connection()
    assert cn is not None
    cur = cn.cursor()
    
    cur.execute("SELECT TOP 1 * FROM dbo.Users")
    cols = [col[0].lower() for col in cur.description]
    
    assert 'roleid' in cols
    assert 'teamid' in cols
    assert 'employeeid' in cols
    assert 'managerid' in cols
    assert 'role' not in cols  # Redundant column removed
    assert 'teamname' not in cols  # Redundant column removed
    
    # Check Mohan
    cur.execute("SELECT EmployeeId, RoleId FROM dbo.Users WHERE LOWER(Username) = 'mohan'")
    mohan = cur.fetchone()
    assert mohan[0] == 'M01'
    assert mohan[1] == 2  # Manager role
    cn.close()

def test_dynamic_priority_management(auth_manager):
    # Get priorities
    resp = client.get("/api/reference/priorities")
    assert resp.status_code == 200
    p_list = resp.json()
    assert "Low" in p_list
    assert "High" in p_list

    # Add new priority
    add_resp = client.post(
        "/api/reference/config/add",
        json={"category": "priorities", "value": "Ultra-Urgent"},
        headers=auth_manager
    )
    assert add_resp.status_code == 200
    assert add_resp.json()["success"] is True

    # Toggle to active
    toggle_resp = client.post(
        "/api/reference/config/toggle-status",
        json={"category": "priorities", "value": "Ultra-Urgent", "status": "Active"},
        headers=auth_manager
    )
    assert toggle_resp.status_code == 200

    resp2 = client.get("/api/reference/priorities?active_only=true")
    assert "Ultra-Urgent" in resp2.json()

    # Delete priority
    del_resp = client.post(
        "/api/reference/config/delete",
        json={"category": "priorities", "value": "Ultra-Urgent"},
        headers=auth_manager
    )
    assert del_resp.status_code == 200

def test_dynamic_status_management(auth_manager):
    # Get statuses
    resp = client.get("/api/reference/statuses")
    assert resp.status_code == 200
    s_list = resp.json()
    assert "Completed" in s_list
    assert "In Progress" in s_list

    # Add new status
    add_resp = client.post(
        "/api/reference/config/add",
        json={"category": "statuses", "value": "Under Review"},
        headers=auth_manager
    )
    assert add_resp.status_code == 200
    assert add_resp.json()["success"] is True

    # Toggle to active
    toggle_resp = client.post(
        "/api/reference/config/toggle-status",
        json={"category": "statuses", "value": "Under Review", "status": "Active"},
        headers=auth_manager
    )
    assert toggle_resp.status_code == 200

    resp2 = client.get("/api/reference/statuses?active_only=true")
    assert "Under Review" in resp2.json()

    # Delete status
    del_resp = client.post(
        "/api/reference/config/delete",
        json={"category": "statuses", "value": "Under Review"},
        headers=auth_manager
    )
    assert del_resp.status_code == 200

def test_projects_and_modules_fetched_dynamically():
    resp_proj = client.get("/api/reference/projects")
    assert resp_proj.status_code == 200
    projects = resp_proj.json()
    assert len(projects) > 0
    assert "Suntory" in projects or "ADIB" in projects or ".Net" in projects

    resp_mod = client.get("/api/reference/modules")
    assert resp_mod.status_code == 200
    modules = resp_mod.json()
    assert len(modules) > 0

