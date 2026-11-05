from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response, status, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.services.import_service import (
    validate_timesheet_import,
    confirm_timesheet_import,
    generate_sample_csv
)
from app.core.security import require_manager

router = APIRouter(prefix="/api/timesheets/import", tags=["Timesheet Import"])

class ConfirmImportRequest(BaseModel):
    importId: str
    employeeId: str
    targetState: Optional[str] = "Submitted"
    selectedDuplicateRowNumbers: Optional[List[int]] = None

@router.post("/preview")
async def preview_timesheet_import(
    file: UploadFile = File(...),
    employee_id: str = Form(...),
    user: dict = Depends(require_manager)
):
    """
    Parses and validates an uploaded .xlsx or .csv timesheet file for a manager.
    Does not persist records; returns summary, column mappings, and row-level issues.
    """
    filename = file.filename or "uploaded_timesheet.csv"
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if ext not in ("xlsx", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '.{ext}'. Please upload an Excel (.xlsx) or CSV (.csv) file."
        )

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read uploaded file: {str(e)}"
        )

    result = validate_timesheet_import(
        file_bytes=contents,
        filename=filename,
        target_emp_id=employee_id
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.get("error", "Validation failed")
        )

    return result

@router.post("/confirm")
def confirm_import(req: ConfirmImportRequest, user: dict = Depends(require_manager)):
    """
    Commits valid records from a validated preview session to the application data.
    """
    result = confirm_timesheet_import(
        import_id=req.importId,
        target_emp_id=req.employeeId,
        target_state=req.targetState or "Submitted",
        selected_duplicate_row_numbers=req.selectedDuplicateRowNumbers
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Import confirmation failed")
        )

    return result

@router.get("/sample-template")
def download_sample_template(user: dict = Depends(require_manager)):
    """
    Returns a downloadable CSV sample template with the standard timesheet headers.
    """
    csv_content = generate_sample_csv()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=timesheet_import_template.csv"}
    )
