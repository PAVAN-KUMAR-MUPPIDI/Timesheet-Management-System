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
    return db.add_employee(
        name=req.name,
        email=req.email,
        team=req.team,
        designation=req.designation,
        password=req.password
    )

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
