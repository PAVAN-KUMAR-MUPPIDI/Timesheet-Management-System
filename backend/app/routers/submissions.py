from fastapi import APIRouter, Depends
from typing import Optional, List
from app.repositories.sqlserver_repository import db
from app.services.calculation_service import annotate_entries, filter_by_period
from app.core.security import require_manager

router = APIRouter(prefix="/api/submissions", tags=["Submissions"])

@router.get("/status")
def get_submission_status(
    month: Optional[str] = None,
    period: Optional[str] = None,
    team: str = "all",
    user: dict = Depends(require_manager)
):
    """RBAC: Manager only."""
    annotate_entries(db.entries)
    emps = db.employees if team == "all" else [e for e in db.employees if e['team'] == team]
    res = []
    for e in emps:
        emp_entries = [x for x in db.entries if x.get("empId") == e['id']]
        emp_entries = filter_by_period(emp_entries, period or month)
        valid_entries = [x for x in emp_entries if not x.get("_dup") and not x.get("_inc")]
        sub = [x for x in valid_entries if x.get("state") == "Submitted"]
        drafts = [x for x in valid_entries if x.get("state") == "Draft"]
        
        wd_count = 5 if period and "Week" in period else 20  # standard working days
        covered = len(set(x.get("date") for x in sub if x.get("date")))
        status = "Submitted" if covered >= wd_count else ("Partially Submitted" if covered > 0 else "Not Submitted")
        
        res.append({
            "id": e['id'],
            "name": e['name'],
            "team": e['team'],
            "status": status,
            "wd": wd_count,
            "covered": covered,
            "missing": max(0, wd_count - covered),
            "coverage": round((covered / wd_count) * 100.0, 1) if wd_count > 0 else 0.0,
            "entries": len(sub),
            "drafts": len(drafts),
            "excluded": len(emp_entries) - len(valid_entries),
            "last": sub[-1].get("submittedAt", "") if sub else ""
        })
    return res
