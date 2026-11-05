import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check_public():
    """Health check endpoint is public without authentication."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "data_mode" in data

def test_unauthenticated_requests_are_rejected():
    """Any sensitive or backend endpoint without auth returns 401 Unauthorized."""
    unauth_client = TestClient(app)
    # Reference endpoints
    assert unauth_client.get("/api/reference/employees").status_code == 401
    assert unauth_client.get("/api/reference/config").status_code == 401
    # Timesheet endpoints
    assert unauth_client.get("/api/timesheets").status_code == 401
    # Reports endpoints
    assert unauth_client.get("/api/reports/data-quality").status_code == 401
    # Submissions
    assert unauth_client.get("/api/submissions/status").status_code == 401

def test_login_manager_sets_httponly_cookie_and_csrf():
    """Login sets HttpOnly access_token cookie and returns csrf_token."""
    response = client.post("/api/auth/login", json={"username": "mohan", "password": "mohan@1234"})
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "manager"
    assert "access_token" in data
    assert "csrf_token" in data
    assert "access_token" in response.cookies
    assert "csrf_token" in response.cookies

def test_manager_can_access_manager_endpoints():
    """Manager can access team dashboard, submissions, and reports."""
    client.post("/api/auth/login", json={"username": "mohan", "password": "mohan@1234"})
    assert client.get("/api/submissions/status").status_code == 200
    assert client.get("/api/reports/data-quality").status_code == 200
    assert client.get("/api/productivity/team-dashboard").status_code == 200

def test_employee_rbac_and_idor_protection():
    """
    Employee cannot access manager endpoints (403 Forbidden).
    Employee cannot view or tamper with other employees' timesheets (IDOR prevented).
    """
    emp_client = TestClient(app)
    login_resp = emp_client.post("/api/auth/login", json={"username": "chandrika.t@company.com", "password": "chandrika@1234"})
    assert login_resp.status_code == 200
    emp_data = login_resp.json()
    assert emp_data["role"] == "employee"
    assert emp_data["employee_id"] == "E01"
    csrf_token = emp_data["csrf_token"]
    emp_client.headers.update({"X-CSRF-Token": csrf_token})

    # 1. RBAC check: Employee blocked from manager-only endpoints
    assert emp_client.get("/api/submissions/status").status_code == 403
    assert emp_client.get("/api/reports/data-quality").status_code == 403
    assert emp_client.get("/api/productivity/team-dashboard").status_code == 403
    assert emp_client.post("/api/reference/config/add", json={"category": "taskTypes", "value": "Hacked"}).status_code == 403

    # 2. IDOR check: Requesting all timesheets or other employee's timesheets filters strictly to E01
    resp = emp_client.get("/api/timesheets?emp_id=E02")
    assert resp.status_code == 200
    entries = resp.json()
    # All returned entries MUST belong strictly to E01
    for entry in entries:
        assert entry["empId"] == "E01"

    # 3. IDOR check: Attempting to access another employee's productivity dashboard fails with 403
    forbidden_dash = emp_client.get("/api/productivity/employee-dashboard?emp_id=E02")
    assert forbidden_dash.status_code == 403

def test_logout_clears_cookies():
    """Logout endpoint removes session cookies."""
    mgr_client = TestClient(app)
    login_resp = mgr_client.post("/api/auth/login", json={"username": "mohan", "password": "mohan@1234"})
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.cookies

    logout_resp = mgr_client.post("/api/auth/logout")
    assert logout_resp.status_code == 200
    # Cookie should be cleared / expired
    cookie_val = logout_resp.cookies.get("access_token")
    assert cookie_val is None or cookie_val == '""' or cookie_val == ""
