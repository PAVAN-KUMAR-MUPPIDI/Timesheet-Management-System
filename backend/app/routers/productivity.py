from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from app.repositories.sqlserver_repository import db
from app.services.calculation_service import annotate_entries, aggregate_entries, filter_by_period
from app.core.security import get_current_user, require_manager

router = APIRouter(prefix="/api/productivity", tags=["Productivity Analytics"])

@router.get("/employee-dashboard")
def get_employee_dashboard(
    emp_id: str,
    month: Optional[str] = None,
    period: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    IDOR Prevention: Employees can only view their own productivity dashboard.
    Managers can view any employee's dashboard.
    """
    is_mgr = user.get("role") == "manager"
    effective_emp_id = emp_id if is_mgr else user.get("employeeId")

    if not is_mgr and emp_id != user.get("employeeId"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You cannot view another employee's productivity metrics."
        )

    annotate_entries(db.entries)
    emp_entries = [e for e in db.entries if e.get("empId") == effective_emp_id]
    emp_entries = filter_by_period(emp_entries, period or month)
    metrics = aggregate_entries(emp_entries)
    return {
        "metrics": metrics,
        "recent_tasks": emp_entries[-10:]
    }

@router.get("/team-dashboard")
def get_team_dashboard(
    month: Optional[str] = None,
    period: Optional[str] = None,
    team: str = "all",
    emp_id: str = "all",
    user: dict = Depends(require_manager)
):
    """RBAC: Manager only."""
    annotate_entries(db.entries)
    emps = db.employees
    if team != "all":
        emps = [e for e in emps if e['team'] == team]
    if emp_id != "all":
        emps = [e for e in emps if e['id'] == emp_id]
    emp_ids = set(e['id'] for e in emps)
    
    valid_submitted = [
        e for e in db.entries 
        if e.get("empId") in emp_ids and e.get("state") == "Submitted"
    ]
    valid_submitted = filter_by_period(valid_submitted, period or month)
    metrics = aggregate_entries(valid_submitted)
    return {
        "metrics": metrics,
        "employeeCount": len(emps)
    }
