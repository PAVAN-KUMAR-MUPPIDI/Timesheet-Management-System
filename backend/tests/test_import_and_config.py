import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.repositories.sqlserver_repository import (
    db,
    DEFAULT_EMPLOYEES,
    DEFAULT_USERS,
    DEFAULT_TASK_TYPES,
    DEFAULT_AI_TOOLS,
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def auth_manager_session():
    """Authenticate client as manager with CSRF token for tests."""
    resp = client.post("/api/auth/login", json={"username": "mohan", "password": "mohan@1234"})
    csrf_token = resp.json().get("csrf_token")
    if csrf_token:
        client.headers.update({"X-CSRF-Token": csrf_token})

EXPECTED_TASK_TYPES = [
    'Design', 'UI Development', 'Front-End Development', 'Back-End Development',
    'Deployment', 'Integration', 'Testing', 'Bug Fixing', 'KT', 'Documentation',
    'Meeting', 'Training', 'Support', 'Research', 'Learning', 'Other'
]

EXPECTED_AI_TOOLS = [
    'ChatGPT', 'GitHub Copilot', 'Claude',
    'Grok', 'Gens Park', 'Banani AI', 'Figma AI', 'Stitch',
    'Perplexity AI', 'Gemini AI', 'Antigravity AI', "OpenText's AI",
    'Other', 'N/A'
]

EXPECTED_DESIGNATIONS = {
    'Chandrika T': 'UX Design',
    'Vishnuvardhan K': 'UX Design',
    'Praveen U': 'Backend',
    'Raghu D': 'Frontend',
    'Sushmitha K': 'QA Engineer',
    'Harsha S': 'Frontend',
    'Moses D': 'QA Engineer',
    'Pavan M': 'Backend'
}

EXPECTED_TEAMS = {
    'Chandrika T': 'UX Design',
    'Vishnuvardhan K': 'UX Design',
    'Praveen U': 'Backend',
    'Raghu D': 'Frontend',
    'Sushmitha K': 'QA',
    'Harsha S': 'Frontend',
    'Moses D': 'QA',
    'Pavan M': 'Backend'
}


def test_default_task_types_values():
    """Verify that only the exact DEFAULT_TASK_TYPES are configured without team_cfg restrictions."""
    assert DEFAULT_TASK_TYPES == EXPECTED_TASK_TYPES
    response = client.get("/api/reference/task-types")
    assert response.status_code == 200
    assert response.json() == EXPECTED_TASK_TYPES


def test_default_ai_tools_values():
    """Verify that only the exact DEFAULT_AI_TOOLS are present."""
    assert DEFAULT_AI_TOOLS == EXPECTED_AI_TOOLS
    response = client.get("/api/reference/ai-tools")
    assert response.status_code == 200
    assert response.json() == EXPECTED_AI_TOOLS


def test_employee_designations_and_teams():
    """Verify employee designations and teams match requirements."""
    response = client.get("/api/reference/employees")
    assert response.status_code == 200
    employees = response.json()
    emp_map = {e["name"]: e for e in employees}

    for name, expected_desig in EXPECTED_DESIGNATIONS.items():
        assert name in emp_map, f"Missing employee {name}"
        assert emp_map[name]["designation"] == expected_desig, (
            f"Employee {name} designation is {emp_map[name]['designation']}, expected {expected_desig}"
        )

    for name, expected_team in EXPECTED_TEAMS.items():
        assert emp_map[name]["team"] == expected_team, (
            f"Employee {name} team is {emp_map[name]['team']}, expected {expected_team}"
        )


def test_dynamic_controlled_field_add_and_toggle(monkeypatch):
    """Verify manager can dynamically add and toggle controlled field status."""
    monkeypatch.setattr(db, "save_seed_data", lambda: None)

    add_resp = client.post("/api/reference/config/add", json={
        "category": "taskTypes",
        "value": "Architecture Review"
    })
    assert add_resp.status_code == 200
    assert add_resp.json()["success"] is True

    cfg_resp = client.get("/api/reference/config")
    assert cfg_resp.status_code == 200
    cfg = cfg_resp.json()
    added_item = next((x for x in cfg["taskTypes"] if x["name"] == "Architecture Review"), None)
    assert added_item is not None
    assert added_item["status"] == "Inactive"

    toggle_resp = client.post("/api/reference/config/toggle-status", json={
        "category": "taskTypes",
        "value": "Architecture Review",
        "status": "Active"
    })
    assert toggle_resp.status_code == 200
    assert toggle_resp.json()["success"] is True

    active_resp = client.get("/api/reference/task-types?active_only=true")
    assert "Architecture Review" in active_resp.json()

    del_resp = client.post("/api/reference/config/delete", json={
        "category": "taskTypes",
        "value": "Architecture Review"
    })
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True


def test_import_validation_with_backend_development():
    """Verify Excel/CSV import validation accepts 'Back-End Development' and canonical DEFAULT_TASK_TYPES."""
    import io
    csv_content = (
        "Date,Project,Module / Page,Task Type,Task Details,Priority,Status,Planned Hours,Actual Hours,AI Effort / AI Hours,AI Tool Used,Notes\n"
        "2026-10-20,Customer Portal,Login Page,Back-End Development,Implement OAuth2 login with Azure AD,High,Completed,8.0,6.5,2.0,GitHub Copilot,\n"
        "2026-10-21,Customer Portal,API Gateway,Backend Development,Refactor JWT verification logic,High,Completed,6.0,5.0,1.5,Claude,\n"
        "2026-10-22,Billing Revamp,Checkout,Front-End Development,Integrate Stripe Elements,Medium,Completed,4.0,4.0,1.0,ChatGPT,\n"
        "2026-10-23,Analytics Hub,Reports,Bug Fixing,Resolve timesheet aggregate variance,Critical,Completed,4.0,3.5,1.0,Antigravity AI,\n"
        "2026-10-24,Mobile App,Dashboard,Testing,Execute Cypress E2E regression suite,Medium,Completed,6.0,6.0,0.0,N/A,\n"
    )

    file_bytes = io.BytesIO(csv_content.encode("utf-8"))
    files = {"file": ("test_import.csv", file_bytes, "text/csv")}
    data = {"employee_id": "E01"}

    response = client.post("/api/timesheets/import/preview", files=files, data=data)
    assert response.status_code == 200, response.text
    res_json = response.json()
    assert res_json["success"] is True

    summary = res_json["summary"]
    assert summary["invalidCount"] == 0
    assert summary["importableCount"] == 5

    rows = res_json["rows"]
    assert rows[0]["parsedData"]["taskType"] == "Back-End Development"
    assert rows[0]["errors"] == []

    assert rows[1]["parsedData"]["taskType"] == "Back-End Development"
    assert rows[1]["errors"] == []

    assert rows[2]["parsedData"]["taskType"] == "Front-End Development"
    assert rows[3]["parsedData"]["taskType"] == "Bug Fixing"
    assert rows[4]["parsedData"]["taskType"] == "Testing"
    assert rows[4]["errors"] == []


def test_import_validation_unknown_task_type_error_message():
    """Verify that unknown task types produce an error listing DEFAULT_TASK_TYPES."""
    import io
    csv_content = (
        "Date,Project,Module / Page,Task Type,Task Details,Priority,Status,Planned Hours,Actual Hours,AI Effort / AI Hours,AI Tool Used,Notes\n"
        "2026-10-20,Customer Portal,Login Page,InvalidMysteryType,Some mystery task,High,Completed,8.0,6.5,2.0,GitHub Copilot,\n"
    )
    file_bytes = io.BytesIO(csv_content.encode("utf-8"))
    files = {"file": ("test_invalid.csv", file_bytes, "text/csv")}
    data = {"employee_id": "E01"}

    response = client.post("/api/timesheets/import/preview", files=files, data=data)
    assert response.status_code == 200
    res_json = response.json()
    row = res_json["rows"][0]
    assert len(row["errors"]) > 0
    err_msg = row["errors"][0]
    assert "Unknown Task Type 'InvalidMysteryType'" in err_msg
    assert "Back-End Development" in err_msg
    assert "UI Development" in err_msg


def test_import_confirm_with_selected_duplicates(monkeypatch):
    """Verify that duplicate rows can be selectively imported when selectedDuplicateRowNumbers is passed."""
    import io
    monkeypatch.setattr(db, "save_seed_data", lambda: None)
    csv_content = (
        "Date,Project,Module / Page,Task Type,Task Details,Priority,Status,Planned Hours,Actual Hours,AI Effort / AI Hours,AI Tool Used,Notes\n"
        "2026-10-20,TestProj,ModA,Back-End Development,Identical Task A,High,Completed,8.0,6.5,2.0,GitHub Copilot,\n"
        "2026-10-20,TestProj,ModA,Back-End Development,Identical Task A,High,Completed,8.0,6.5,2.0,GitHub Copilot,\n"
    )
    file_bytes = io.BytesIO(csv_content.encode("utf-8"))
    files = {"file": ("test_dups.csv", file_bytes, "text/csv")}
    data = {"employee_id": "E01"}

    preview_resp = client.post("/api/timesheets/import/preview", files=files, data=data)
    assert preview_resp.status_code == 200
    p_data = preview_resp.json()
    assert p_data["summary"]["duplicateCount"] == 1
    assert p_data["summary"]["importableCount"] == 1
    import_id = p_data["importId"]
    dup_row_num = p_data["rows"][1]["rowNumber"]

    confirm_payload = {
        "importId": import_id,
        "employeeId": "E01",
        "targetState": "Submitted",
        "selectedDuplicateRowNumbers": [dup_row_num]
    }
    confirm_resp = client.post("/api/timesheets/import/confirm", json=confirm_payload)
    assert confirm_resp.status_code == 200
    c_data = confirm_resp.json()
    assert c_data["success"] is True
    assert c_data["importedCount"] == 2
    assert len(c_data["entries"]) == 2
