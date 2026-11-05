from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    employee_id: Optional[str] = None
    name: str
    email: Optional[str] = None
    designation: Optional[str] = None
    expires_in: Optional[int] = None
    csrf_token: Optional[str] = None

class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

class EmployeeSchema(BaseModel):
    id: str
    name: str
    email: str
    team: str
    designation: str
    managerId: Optional[str] = None
    isActive: bool = True

class TimesheetEntryBase(BaseModel):
    date: str
    month: str
    project: str
    module: Optional[str] = ""
    taskType: str
    details: str
    priority: str = "Medium"
    status: str = "Completed"
    planned: float
    actual: float
    aiHours: float = 0.0
    tool: Optional[str] = ""
    notes: Optional[str] = ""

class TimesheetEntryCreate(TimesheetEntryBase):
    empId: str
    state: str = "Draft"
    manual: Optional[float] = None

class TimesheetEntryUpdate(BaseModel):
    date: Optional[str] = None
    month: Optional[str] = None
    project: Optional[str] = None
    module: Optional[str] = None
    taskType: Optional[str] = None
    details: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    planned: Optional[float] = None
    actual: Optional[float] = None
    aiHours: Optional[float] = None
    manual: Optional[float] = None
    tool: Optional[str] = None
    notes: Optional[str] = None
    state: Optional[str] = None
    submittedAt: Optional[str] = None

class TimesheetEntryOut(TimesheetEntryBase):
    id: str
    empId: str
    empName: Optional[str] = None
    team: Optional[str] = None
    state: str
    manual: float
    saved: float
    savingsPct: float
    submittedAt: Optional[str] = ""
    createdAt: Any = None
    isDuplicate: bool = False
    isIncomplete: bool = False

class SubmissionStatusOut(BaseModel):
    status: str
    wd: int
    covered: int
    missing: int
    coverage: float
    entries: int
    drafts: int
    excluded: int
    last: str

class HealthOut(BaseModel):
    status: str
    data_mode: str
    app_env: str

class DeleteSelectedRequest(BaseModel):
    entry_ids: List[str]

class SubmitSelectedRequest(BaseModel):
    entry_ids: List[str]
