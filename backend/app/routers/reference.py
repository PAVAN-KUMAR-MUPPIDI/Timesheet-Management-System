from fastapi import APIRouter, status, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.repositories.sqlserver_repository import db
from app.core.security import get_current_user, require_manager

router = APIRouter(prefix="/api/reference", tags=["Reference Data"])

class EmployeeCreateReq(BaseModel):
    name: str
    email: str
    team: str
    designation: str
    password: Optional[str] = None

@router.get("/employees")
def get_employees(team: str = "all", user: dict = Depends(get_current_user)):
    return db.get_employees(team)

@router.post("/employees", status_code=status.HTTP_201_CREATED)
def create_employee(req: EmployeeCreateReq, user: dict = Depends(require_manager)):
    """Only managers can create and add employees."""
    clean_name = req.name.strip()
    clean_email = req.email.strip().lower()
    clean_team = req.team.strip()
    clean_desig = req.designation.strip()

    if not clean_name or len(clean_name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full Name must be at least 2 characters.")
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A valid company email address is required.")
    if not clean_team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned Team is required.")
    if not clean_desig:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Designation is required.")

    # Prevent duplicate accounts
    existing_emp = next((e for e in db.employees if (e.get('email') or '').lower() == clean_email), None)
    if existing_emp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"An employee with email '{clean_email}' already exists.")

    try:
        created = db.add_employee(
            name=clean_name,
            email=clean_email,
            team=clean_team,
            designation=clean_desig,
            password=req.password
        )
        return created
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create employee in database: {str(e)}")

class ControlledFieldReq(BaseModel):
    category: str
    value: str

class ControlledToggleReq(BaseModel):
    category: str
    value: str
    status: Optional[str] = None

@router.get("/config")
def get_controlled_config(user: dict = Depends(get_current_user)):
    return db.get_controlled_fields()

@router.post("/config/add")
def add_controlled_field(req: ControlledFieldReq, user: dict = Depends(require_manager)):
    """Only managers can add controlled fields."""
    try:
        updated = db.add_controlled_field(req.category, req.value, status="Inactive")
        return {
            "success": True,
            "category": req.category,
            "values": updated,
            "message": f"Added '{req.value}' to {req.category} (default: Inactive)"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/config/toggle-status")
def toggle_controlled_status(req: ControlledToggleReq, user: dict = Depends(require_manager)):
    """Only managers can activate/deactivate controlled fields."""
    try:
        updated = db.toggle_controlled_status(req.category, req.value, req.status)
        return {
            "success": True,
            "category": req.category,
            "values": updated,
            "message": f"Updated status of '{req.value}' in {req.category}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/config/delete")
def delete_controlled_field(req: ControlledFieldReq, user: dict = Depends(require_manager)):
    """Only managers can delete controlled fields."""
    try:
        updated = db.delete_controlled_field(req.category, req.value)
        return {
            "success": True,
            "category": req.category,
            "values": updated,
            "message": f"Removed '{req.value}' from {req.category}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/teams")
def get_teams(user: dict = Depends(get_current_user)):
    return db.get_controlled_fields().get("teams", [])

@router.get("/projects")
def get_projects(user: dict = Depends(get_current_user)):
    return db.get_controlled_fields().get("projects", [])

@router.get("/modules")
def get_modules(user: dict = Depends(get_current_user)):
    return db.get_controlled_fields().get("modules", [])

@router.get("/task-types")
def get_task_types(active_only: bool = True, user: dict = Depends(get_current_user)):
    items = db.get_controlled_fields().get("taskTypes", [])
    if not active_only:
        return items
    return [x["name"] if isinstance(x, dict) else x for x in items if not isinstance(x, dict) or x.get("status") == "Active"]

@router.get("/ai-tools")
def get_ai_tools(active_only: bool = True, user: dict = Depends(get_current_user)):
    items = db.get_controlled_fields().get("aiTools", [])
    if not active_only:
        return items
    return [x["name"] if isinstance(x, dict) else x for x in items if not isinstance(x, dict) or x.get("status") == "Active"]

@router.get("/statuses")
def get_statuses(active_only: bool = True, user: dict = Depends(get_current_user)):
    items = db.get_controlled_fields().get("statuses", [])
    if not active_only:
        return items
    return [x["name"] if isinstance(x, dict) else x for x in items if not isinstance(x, dict) or x.get("status") == "Active"]

@router.get("/priorities")
def get_priorities(active_only: bool = True, user: dict = Depends(get_current_user)):
    items = db.get_controlled_fields().get("priorities", [])
    if not active_only:
        return items
    return [x["name"] if isinstance(x, dict) else x for x in items if not isinstance(x, dict) or x.get("status") == "Active"]
