from fastapi import APIRouter, Depends
from typing import Optional
from app.repositories.sqlserver_repository import db, TOOLS
from app.services.calculation_service import annotate_entries, aggregate_entries, filter_by_period
from app.core.security import get_current_user

router = APIRouter(prefix="/api/ai-usage", tags=["AI Usage Analytics"])

@router.get("/summary")
def get_ai_usage_summary(
    month: Optional[str] = None,
    period: Optional[str] = None,
    team: str = "all",
    emp_id: str = "all",
    user: dict = Depends(get_current_user)
):
    """
    AI usage analytics summary.
    IDOR Prevention: Employees can only view their own AI usage.
    Managers can view team analytics or filter by employee.
    """
    is_mgr = user.get("role") == "manager"
    effective_emp_id = emp_id if is_mgr else user.get("employeeId")

    annotate_entries(db.entries)
    emps = db.employees
    if is_mgr and team != "all":
        emps = [e for e in emps if e['team'] == team]
    if effective_emp_id and effective_emp_id != "all":
        emps = [e for e in emps if e['id'] == effective_emp_id]
        
    emp_ids = set(e['id'] for e in emps)
    
    valid_submitted = [
        e for e in db.entries 
        if e.get("empId") in emp_ids and e.get("state") == "Submitted"
    ]
    valid_submitted = filter_by_period(valid_submitted, period or month)
    metrics = aggregate_entries(valid_submitted)
    
    tool_rows = []
    for t in TOOLS:
        t_list = [e for e in valid_submitted if e.get("tool") == t]
        if t_list:
            t_agg = aggregate_entries(t_list)
            tool_rows.append({
                "tool": t,
                "tasks": t_agg["tasks"],
                "planned": t_agg["planned"],
                "actual": t_agg["actual"],
                "ai": t_agg["ai"],
                "saved": t_agg["saved"],
                "eff": t_agg["efficiency"]
            })
            
    return {
        "metrics": metrics,
        "tools": tool_rows
    }
