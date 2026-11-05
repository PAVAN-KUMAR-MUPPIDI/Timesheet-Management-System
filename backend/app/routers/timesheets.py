from fastapi import APIRouter, HTTPException, Query, status, Depends
from typing import Optional, List
from datetime import datetime
from app.schemas.schemas import TimesheetEntryCreate, TimesheetEntryUpdate, TimesheetEntryOut, SubmitSelectedRequest, DeleteSelectedRequest
from app.repositories.sqlserver_repository import db
from app.services.calculation_service import annotate_entries, calc_entry, is_ai, filter_by_period
from app.core.security import get_current_user

router = APIRouter(prefix="/api/timesheets", tags=["Timesheets"])

def format_entry(e: dict) -> dict:
    c = calc_entry(e.get("planned", 0), e.get("actual", 0), e.get("aiHours", 0), e.get("status", ""))
    emp = next((x for x in db.employees if x['id'] == e.get("empId")), None)
    return {
        **e,
        "empName": emp['name'] if emp else e.get("empId"),
        "team": emp['team'] if emp else "",
        "manual": c["manual"],
        "saved": c["saved"],
        "savingsPct": c["savingsPct"],
        "isDuplicate": e.get("_dup", False),
        "isIncomplete": e.get("_inc", False)
    }

@router.get("", response_model=List[TimesheetEntryOut])
def get_timesheets(
    emp_id: Optional[str] = None,
    month: Optional[str] = None,
    period: Optional[str] = None,
    submitted_only: bool = False,
    team: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Retrieves timesheet entries.
    IDOR Prevention: Employees can ONLY view their own records.
    Managers can view team records or filter by employee.
    """
    db.load_data()
    entries = annotate_entries(db.entries)
    if period:
        entries = filter_by_period(entries, period)
        
    is_mgr = user.get("role") == "manager"
    effective_emp_id = emp_id if is_mgr else user.get("employeeId")
    
    res = []
    for e in entries:
        if effective_emp_id and effective_emp_id != "all" and e.get("empId") != effective_emp_id:
            continue
        if not period and month and month != "all" and e.get("month") != month:
            continue
        if submitted_only and e.get("state") != "Submitted":
            continue
        if is_mgr and team and team != "all":
            emp = next((x for x in db.employees if x['id'] == e.get("empId")), None)
            if not emp or emp['team'] != team:
                continue
        res.append(format_entry(e))
    return res

@router.post("", response_model=TimesheetEntryOut, status_code=status.HTTP_201_CREATED)
def create_timesheet(data: TimesheetEntryCreate, user: dict = Depends(get_current_user)):
    """
    Creates a timesheet entry.
    IDOR Prevention: Employees can only create entries for their own employeeId.
    """
    is_mgr = user.get("role") == "manager"
    target_emp_id = data.empId if is_mgr else (user.get("employeeId") or data.empId)
    
    db.seq += 1
    new_id = f"T{db.seq}"
    rec = data.dict()
    rec["id"] = new_id
    rec["empId"] = target_emp_id
    rec["month"] = data.date[:7]
    rec["createdAt"] = db.seq
    rec["submittedAt"] = datetime.now().strftime("%Y-%m-%dT%H:%M") if data.state == "Submitted" else ""
    db.entries.append(rec)
    annotate_entries(db.entries)
    db.save_seed_data()
    return format_entry(rec)

@router.put("/{entry_id}", response_model=TimesheetEntryOut)
def update_timesheet(entry_id: str, data: TimesheetEntryUpdate, user: dict = Depends(get_current_user)):
    """
    Updates a timesheet entry.
    IDOR & Ownership Check: Employees can only modify their own entries.
    """
    db.load_data()
    e = next((x for x in db.entries if x["id"] == entry_id), None)
    if not e:
        raise HTTPException(status_code=404, detail="Timesheet entry not found")
        
    is_mgr = user.get("role") == "manager"
    if not is_mgr and e.get("empId") != user.get("employeeId"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to modify another employee's timesheet."
        )

    rec = data.dict(exclude_unset=True)
    if "date" in rec and rec["date"]:
        rec["month"] = rec["date"][:7]
    if rec.get("state") == "Submitted":
        if not rec.get("submittedAt"):
            rec["submittedAt"] = datetime.now().strftime("%Y-%m-%dT%H:%M")
    elif rec.get("state") == "Draft":
        rec["submittedAt"] = ""
        
    # Prevent changing empId via update
    if "empId" in rec and not is_mgr:
        del rec["empId"]

    e.update(rec)
    annotate_entries(db.entries)
    db.save_seed_data()
    return format_entry(e)

@router.delete("/{entry_id}")
def delete_timesheet(entry_id: str, user: dict = Depends(get_current_user)):
    """
    Deletes a timesheet entry.
    IDOR & Ownership Check: Employees can only delete their own entries.
    """
    e = next((x for x in db.entries if x["id"] == entry_id), None)
    if not e:
        raise HTTPException(status_code=404, detail="Timesheet entry not found")
        
    is_mgr = user.get("role") == "manager"
    if not is_mgr and e.get("empId") != user.get("employeeId"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have permission to delete another employee's timesheet."
        )

    db.entries = [x for x in db.entries if x["id"] != entry_id]
    annotate_entries(db.entries)
    db.save_seed_data()
    return {"message": "Deleted successfully", "id": entry_id}

@router.post("/delete-selected")
def delete_selected(data: DeleteSelectedRequest, user: dict = Depends(get_current_user)):
    """
    Deletes multiple selected draft entries with ownership verification.
    """
    ids_set = set(data.entry_ids)
    is_mgr = user.get("role") == "manager"
    current_emp_id = user.get("employeeId")
    
    # Ownership verification
    if not is_mgr:
        unauthorized = [x for x in db.entries if x.get("id") in ids_set and x.get("empId") != current_emp_id]
        if unauthorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Cannot delete entries belonging to other employees."
            )

    before_count = len(db.entries)
    db.entries = [
        x for x in db.entries 
        if not (x.get("id") in ids_set and x.get("state") != "Submitted" and (is_mgr or x.get("empId") == current_emp_id))
    ]
    deleted_count = before_count - len(db.entries)
    annotate_entries(db.entries)
    db.save_seed_data()
    return {"message": f"Deleted {deleted_count} selected entries", "count": deleted_count}

@router.post("/submit-selected")
def submit_selected(data: SubmitSelectedRequest, user: dict = Depends(get_current_user)):
    """
    Submits multiple selected draft entries with ownership verification.
    """
    ids_set = set(data.entry_ids)
    is_mgr = user.get("role") == "manager"
    current_emp_id = user.get("employeeId")
    
    # Ownership verification
    if not is_mgr:
        unauthorized = [x for x in db.entries if x.get("id") in ids_set and x.get("empId") != current_emp_id]
        if unauthorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Cannot submit entries belonging to other employees."
            )

    now = datetime.now().strftime("%Y-%m-%dT%H:%M")
    count = 0
    for e in db.entries:
        if e.get("id") in ids_set and e.get("state") == "Draft" and (is_mgr or e.get("empId") == current_emp_id):
            e["state"] = "Submitted"
            e["submittedAt"] = now
            count += 1
            
    annotate_entries(db.entries)
    db.save_seed_data()
    return {"message": f"Submitted {count} selected entries", "count": count}

@router.post("/submit-month")
def submit_month(emp_id: str, month: str, user: dict = Depends(get_current_user)):
    """
    Submits all draft entries for an employee for a given month.
    IDOR Prevention: Employees can only submit their own month.
    """
    is_mgr = user.get("role") == "manager"
    target_emp_id = emp_id if is_mgr else user.get("employeeId")
    
    if not is_mgr and emp_id != user.get("employeeId"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot submit timesheets for another employee."
        )

    now = datetime.now().strftime("%Y-%m-%dT%H:%M")
    count = 0
    for e in db.entries:
        if e.get("empId") == target_emp_id and e.get("month") == month and e.get("state") == "Draft":
            e["state"] = "Submitted"
            e["submittedAt"] = now
            count += 1
            
    annotate_entries(db.entries)
    db.save_seed_data()
    return {"message": f"Submitted {count} draft entries for month {month}", "count": count}
