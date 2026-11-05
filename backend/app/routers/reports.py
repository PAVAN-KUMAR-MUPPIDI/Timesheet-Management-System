from fastapi import APIRouter, Depends
from typing import Optional
from app.repositories.sqlserver_repository import db
from app.services.calculation_service import annotate_entries, calc_entry, aggregate_entries, filter_by_period
from app.core.security import require_manager

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/data-quality")
def get_data_quality_report(
    month: Optional[str] = None,
    period: Optional[str] = None,
    team: str = "all",
    user: dict = Depends(require_manager)
):
    """RBAC: Manager only."""
    annotate_entries(db.entries)
    emps = db.employees if team == "all" else [e for e in db.employees if e['team'] == team]
    emp_ids = set(e['id'] for e in emps)
    
    excl = [
        e for e in db.entries 
        if (e.get("_dup") or e.get("_inc")) and e.get("empId") in emp_ids
    ]
    excl = filter_by_period(excl, period or month)
    res = []
    for e in excl:
        emp = next((x for x in db.employees if x['id'] == e.get("empId")), None)
        reason = "Duplicate" if e.get("_dup") else "Incomplete"
        res.append({
            "empName": emp['name'] if emp else e.get("empId"),
            "date": e.get("date"),
            "project": e.get("project"),
            "taskType": e.get("taskType"),
            "details": e.get("details"),
            "planned": e.get("planned"),
            "actual": e.get("actual"),
            "flag": reason
        })
    return res
