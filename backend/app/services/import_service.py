import os
import io
import csv
import uuid
import math
import re
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional, Tuple
from openpyxl import load_workbook

from app.repositories.sqlserver_repository import (
    db, NO_AI, DEFAULT_TASK_TYPES, DEFAULT_AI_TOOLS,
    DEFAULT_STATUSES, DEFAULT_PRIORITIES
)
from app.services.calculation_service import calc_entry, round2, safe_pct

HEADER_ALIASES: Dict[str, List[str]] = {
    'date': ['date', 'task date', 'entry date', 'dt', 'work date', 'timesheet date'],
    'month': ['month', 'timesheet month', 'mth', 'period'],
    'project': ['project', 'project name', 'proj', 'project title'],
    'module': ['module', 'module / page', 'module/page', 'page', 'component', 'feature', 'sub project'],
    'taskType': ['task type', 'task_type', 'type', 'activity type', 'task category'],
    'status': ['status', 'task status', 'state', 'progress'],
    'tool': ['ai tool used', 'ai tool', 'tool', 'ai_tool', 'tool used', 'ai tools'],
    'details': ['task details', 'details', 'task description', 'description', 'task', 'summary', 'work done'],
    'priority': ['priority', 'task priority', 'prio', 'severity'],
    'planned': ['planned hours', 'planned hrs', 'planned', 'plan hours', 'plan hrs', 'estimated hours', 'estimate'],
    'actual': ['actual hours', 'actual hrs', 'actual', 'act hours', 'act hrs', 'spent hours', 'hours spent'],
    'aiHours': ['ai effort / ai hours', 'ai hours', 'ai hrs', 'ai effort', 'ai_hours', 'ai time'],
    'manualEffort': ['manual effort', 'manual hrs', 'manual hours', 'manual', 'manual time'],
    'saved': ['effort saved', 'hours saved', 'saved hours', 'saved', 'time saved'],
    'savingsPct': ['savings %', 'savings pct', 'savings percentage', 'savings'],
    'notes': ['notes / justification', 'notes', 'justification', 'comments', 'remark', 'remarks']
}

REQUIRED_CANONICAL_FIELDS = ['date', 'project', 'taskType', 'status', 'tool', 'details', 'planned', 'actual', 'aiHours']

OBSOLETE_TASK_TYPES = {
    'development', 'wireframing', 'prototyping', 'code review',
    'api integration', 'unit testing', 'test case design',
    'automation testing', 'bug verification', 'database', 'design review',
    'user research', 'manual testing'
}

OBSOLETE_AI_TOOLS = {
    'cursor', 'windsurf', 'blackbox', 'uizard', 'adobe firefly', 'ux pilot'
}

TASK_TYPE_ALIASES = {
    'design': 'Design',
    'uidevelopment': 'UI Development',
    'ui': 'UI Development',
    'uidev': 'UI Development',
    'frontenddevelopment': 'Front-End Development',
    'frontend': 'Front-End Development',
    'fe': 'Front-End Development',
    'fedev': 'Front-End Development',
    'backenddevelopment': 'Back-End Development',
    'backend': 'Back-End Development',
    'be': 'Back-End Development',
    'bedev': 'Back-End Development',
    'deployment': 'Deployment',
    'deploy': 'Deployment',
    'devops': 'Deployment',
    'cicd': 'Deployment',
    'integration': 'Integration',
    'apiintegration': 'Integration',
    'testing': 'Testing',
    'test': 'Testing',
    'unittesting': 'Testing',
    'manualtesting': 'Testing',
    'automationtesting': 'Testing',
    'qa': 'Testing',
    'bugfixing': 'Bug Fixing',
    'bugfix': 'Bug Fixing',
    'bug': 'Bug Fixing',
    'bugs': 'Bug Fixing',
    'bugverification': 'Bug Fixing',
    'kt': 'KT',
    'knowledgetransfer': 'KT',
    'documentation': 'Documentation',
    'docs': 'Documentation',
    'doc': 'Documentation',
    'meeting': 'Meeting',
    'meetings': 'Meeting',
    'training': 'Training',
    'support': 'Support',
    'research': 'Research',
    'userresearch': 'Research',
    'learning': 'Learning',
    'other': 'Other'
}

def simplify_string(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', str(s or '')).lower()

def normalize_task_type(raw_val: str, valid_list: List[str]) -> Optional[str]:
    if not raw_val:
        return None
    cleaned = str(raw_val).strip()
    if not cleaned:
        return None

    # 1. Exact case-insensitive match
    for v in valid_list:
        if cleaned.lower() == v.lower():
            return v

    # 2. Simplified alphanumeric match
    simple = simplify_string(cleaned)
    for v in valid_list:
        if simple == simplify_string(v):
            return v

    # 3. Known aliases
    if simple in TASK_TYPE_ALIASES:
        canonical = TASK_TYPE_ALIASES[simple]
        if canonical in valid_list or canonical in DEFAULT_TASK_TYPES:
            return canonical

    return None

AI_TOOL_ALIASES = {
    'chatgpt': 'ChatGPT',
    'gpt': 'ChatGPT',
    'gpt4': 'ChatGPT',
    'openai': 'ChatGPT',
    'githubcopilot': 'GitHub Copilot',
    'copilot': 'GitHub Copilot',
    'ghcopilot': 'GitHub Copilot',
    'claude': 'Claude',
    'anthropic': 'Claude',
    'grok': 'Grok',
    'genspark': 'Gens Park',
    'gens': 'Gens Park',
    'bananiai': 'Banani AI',
    'banani': 'Banani AI',
    'figmaai': 'Figma AI',
    'figma': 'Figma AI',
    'stitch': 'Stitch',
    'perplexityai': 'Perplexity AI',
    'perplexity': 'Perplexity AI',
    'geminiai': 'Gemini AI',
    'gemini': 'Gemini AI',
    'antigravityai': 'Antigravity AI',
    'antigravity': 'Antigravity AI',
    'googleantigravity': 'Antigravity AI',
    'opentextsai': "OpenText's AI",
    'opentextai': "OpenText's AI",
    'opentext': "OpenText's AI",
    'other': 'Other',
    'na': 'N/A',
    'notapplicable': 'N/A'
}

def normalize_ai_tool(raw_val: str, valid_list: List[str]) -> Optional[str]:
    if not raw_val:
        return None
    cleaned = str(raw_val).strip()
    if not cleaned:
        return None

    # 1. Exact match
    for v in valid_list:
        if cleaned.lower() == v.lower():
            return v

    # 2. Simplified alphanumeric match
    simple = simplify_string(cleaned)
    for v in valid_list:
        if simple == simplify_string(v):
            return v

    # 3. Aliases
    if simple in AI_TOOL_ALIASES:
        canonical = AI_TOOL_ALIASES[simple]
        if canonical in valid_list or canonical in DEFAULT_AI_TOOLS:
            return canonical

    return None


# In-memory storage for pending import preview sessions (cleared after 1 hour)
import_sessions: Dict[str, Dict[str, Any]] = {}

def clean_cell_text(val: Any) -> str:
    if val is None:
        return ''
    s = str(val).strip()
    # Protect against CSV/formula injection
    if s and s[0] in ('=', '+', '-', '@') and len(s) > 1:
        s = "'" + s
    return s

def normalize_header(h: str) -> str:
    return str(h or '').strip().lower().replace('_', ' ').replace('-', ' ')

def match_headers(raw_headers: List[str]) -> Tuple[Dict[str, str], List[str], List[str]]:
    mapped: Dict[str, str] = {} # raw -> canonical
    unmapped: List[str] = []
    seen_canonical = set()

    for raw in raw_headers:
        norm = normalize_header(raw)
        matched_canon = None
        for canon, aliases in HEADER_ALIASES.items():
            if norm == canon.lower() or norm in [normalize_header(a) for a in aliases]:
                matched_canon = canon
                break
        if matched_canon and matched_canon not in seen_canonical:
            mapped[raw] = matched_canon
            seen_canonical.add(matched_canon)
        else:
            unmapped.append(raw)

    missing_required = [f for f in REQUIRED_CANONICAL_FIELDS if f not in seen_canonical]
    return mapped, unmapped, missing_required

def parse_date_value(val: Any) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (iso_date_str YYYY-MM-DD, derived_month YYYY-MM, error_msg)"""
    if val is None or str(val).strip() == '':
        return None, None, "Date is required."

    # If it's already a date or datetime object (e.g. from openpyxl)
    if isinstance(val, (datetime, date)):
        iso_str = val.strftime('%Y-%m-%d')
        return iso_str, iso_str[:7], None

    # If it's an Excel serial date number
    if isinstance(val, (int, float)):
        try:
            # Excel base date is 1899-12-30 due to the 1900 leap year bug
            excel_base = datetime(1899, 12, 30)
            parsed_dt = excel_base + timedelta(days=float(val))
            iso_str = parsed_dt.strftime('%Y-%m-%d')
            return iso_str, iso_str[:7], None
        except Exception:
            pass

    s = str(val).strip()

    formats = [
        '%Y-%m-%d',
        '%d-%m-%Y',
        '%d/%m/%Y',
        '%Y/%m/%d',
        '%m/%d/%Y',
        '%d.%m.%Y',
        '%Y.%m.%d'
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            iso_str = dt.strftime('%Y-%m-%d')
            return iso_str, iso_str[:7], None
        except ValueError:
            continue

    return None, None, f"Invalid date format '{s}'. Expected YYYY-MM-DD, DD-MM-YYYY, or DD/MM/YYYY."

def is_valid_half_hour(val: Any, min_val: float = 0.0) -> bool:
    try:
        num = float(val)
        if math.isnan(num) or not math.isfinite(num) or num < min_val:
            return False
        return abs((num * 2.0) - round(num * 2.0)) < 0.001
    except (ValueError, TypeError):
        return False

def parse_file_to_rows(file_bytes: bytes, filename: str) -> Tuple[List[str], List[Dict[str, Any]], Optional[str]]:
    """Parses .xlsx or .csv into (headers, list of raw row dicts, error_message)"""
    ext = os.path.splitext(filename)[1].lower()

    if ext == '.csv':
        try:
            # Try utf-8-sig first (handles BOM), then fallback to latin-1
            text = None
            for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
                try:
                    text = file_bytes.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            if text is None:
                return [], [], "Could not decode CSV file. Please ensure it is saved in UTF-8 format."

            stream = io.StringIO(text.strip())
            reader = csv.reader(stream)
            headers = next(reader, None)
            if not headers:
                return [], [], "CSV file is empty or missing a header row."

            headers = [h.strip() for h in headers if h.strip()]
            rows: List[Dict[str, Any]] = []
            for row in reader:
                if not any(row):  # skip blank lines
                    continue
                row_dict = {}
                for idx, h in enumerate(headers):
                    row_dict[h] = row[idx] if idx < len(row) else ''
                rows.append(row_dict)

            return headers, rows, None
        except Exception as e:
            return [], [], f"Error parsing CSV: {str(e)}"

    elif ext in ('.xlsx', '.xls'):
        if ext == '.xls':
            return [], [], "Legacy .xls format is not supported. Please save as modern .xlsx workbook."
        try:
            wb = load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
            sheet = wb.active
            if not sheet:
                return [], [], "Excel workbook contains no active worksheets."

            row_iter = sheet.iter_rows(values_only=True)
            headers_raw = next(row_iter, None)
            if not headers_raw:
                return [], [], "Excel sheet is empty."

            headers = [str(h).strip() for h in headers_raw if h is not None and str(h).strip()]
            rows: List[Dict[str, Any]] = []

            for row_vals in row_iter:
                if not any(v is not None and str(v).strip() for v in row_vals):
                    continue
                row_dict = {}
                for idx, h in enumerate(headers):
                    val = row_vals[idx] if idx < len(row_vals) else ''
                    row_dict[h] = val
                rows.append(row_dict)

            wb.close()
            return headers, rows, None
        except Exception as e:
            return [], [], f"Error reading Excel workbook: {str(e)}"
    else:
        return [], [], f"Unsupported file extension '{ext}'. Only .xlsx and .csv are supported."

def validate_timesheet_import(
    file_bytes: bytes,
    filename: str,
    target_emp_id: str
) -> Dict[str, Any]:
    db.load_data()
    # 1. Check target employee
    emp = next((e for e in db.employees if e['id'] == target_emp_id), None)
    if not emp:
        return {
            "success": False,
            "error": f"Target employee ID '{target_emp_id}' not found in organization."
        }

    # 2. Check file size (max 10MB)
    if len(file_bytes) > 10 * 1024 * 1024:
        return {
            "success": False,
            "error": "File size exceeds 10MB maximum limit."
        }

    # 3. Parse file
    headers, raw_rows, parse_err = parse_file_to_rows(file_bytes, filename)
    if parse_err:
        return {
            "success": False,
            "error": parse_err
        }

    if not raw_rows:
        return {
            "success": False,
            "error": "File contains no data rows to import."
        }

    if len(raw_rows) > 5000:
        return {
            "success": False,
            "error": f"File contains {len(raw_rows)} rows, exceeding the 5,000 row maximum batch limit."
        }

    # 4. Column matching
    raw_to_canon, unmapped_headers, missing_required = match_headers(headers)
    if missing_required:
        return {
            "success": False,
            "error": f"Missing required column(s): {', '.join(missing_required)}. Please ensure your file headers match the standard template."
        }

    # 5. Load controlled values dynamically from MockRepository
    def _extract_active_list(items):
        res = []
        for x in (items or []):
            if isinstance(x, dict):
                if x.get('status') != 'Inactive':
                    n = str(x.get('name', '')).strip()
                    if n:
                        res.append(n)
            elif isinstance(x, str) and x.strip():
                res.append(x.strip())
        return res

    controlled = db.get_controlled_fields()
    raw_tts = _extract_active_list(controlled.get('taskTypes'))
    raw_ais = _extract_active_list(controlled.get('aiTools'))
    raw_statuses = _extract_active_list(controlled.get('statuses'))
    raw_priorities = _extract_active_list(controlled.get('priorities'))

    valid_task_types = [
        t for t in list(dict.fromkeys(raw_tts))
        if t.lower() not in OBSOLETE_TASK_TYPES or t in raw_tts
    ]
    valid_ai_tools = [
        t for t in list(dict.fromkeys(raw_ais))
        if t.lower() not in OBSOLETE_AI_TOOLS or t in raw_ais
    ]
    valid_statuses = list(dict.fromkeys(raw_statuses))
    valid_priorities = list(dict.fromkeys(raw_priorities))

    # Existing entries for this employee for DB conflict detection
    existing_entries = [e for e in db.entries if e.get('empId') == target_emp_id]
    existing_dup_keys = {
        f"{str(e.get('date')).strip()}|{str(e.get('project')).strip().lower()}|{str(e.get('taskType')).strip().lower()}|{str(e.get('details')).strip().lower()}": e.get('id')
        for e in existing_entries
    }

    seen_file_keys: Dict[str, int] = {} # key -> first rowNumber
    preview_rows: List[Dict[str, Any]] = []

    valid_count = 0
    corrected_count = 0
    warning_count = 0
    invalid_count = 0
    duplicate_count = 0

    for idx, raw_row in enumerate(raw_rows, start=2): # Start at 2 accounting for header row 1
        row_errors: List[str] = []
        row_warnings: List[str] = []
        row_corrections: List[str] = []

        # Extract mapped values
        canon_vals: Dict[str, Any] = {}
        for raw_h, canon_h in raw_to_canon.items():
            canon_vals[canon_h] = raw_row.get(raw_h)

        # A. Date and Month Validation
        raw_date = canon_vals.get('date')
        iso_date, derived_month, date_err = parse_date_value(raw_date)
        if date_err:
            row_errors.append(date_err)
        else:
            # Check for future date (optional check)
            pass

        raw_month = clean_cell_text(canon_vals.get('month'))
        final_month = derived_month or ''
        if raw_month and derived_month and raw_month != derived_month:
            row_corrections.append(f"Month automatically aligned from '{raw_month}' to '{derived_month}' based on Date.")
        elif not raw_month and derived_month:
            row_corrections.append(f"Month derived from Date as '{derived_month}'.")

        # B. Text Fields: Project, Details, Module
        project = clean_cell_text(canon_vals.get('project'))
        if not project:
            row_errors.append("Project is required.")

        details = clean_cell_text(canon_vals.get('details'))
        if not details:
            row_errors.append("Task Details are required.")

        module = clean_cell_text(canon_vals.get('module'))

        # C. Controlled Fields: Task Type, Status, Priority, AI Tool
        raw_task_type = clean_cell_text(canon_vals.get('taskType'))
        task_type = raw_task_type
        if not raw_task_type:
            row_errors.append("Task Type is required.")
        else:
            matched_type = normalize_task_type(raw_task_type, valid_task_types)
            if matched_type:
                if matched_type != raw_task_type:
                    row_corrections.append(f"Task Type '{raw_task_type}' aligned to '{matched_type}'.")
                task_type = matched_type
            else:
                row_errors.append(f"Unknown Task Type '{raw_task_type}'. Must be one of: {', '.join(valid_task_types)}")

        status = clean_cell_text(canon_vals.get('status'))
        if not status:
            row_errors.append("Status is required.")
        else:
            matched_status = next((s for s in valid_statuses if s.lower() == status.lower()), None)
            if matched_status:
                if matched_status != status:
                    row_corrections.append(f"Status '{status}' aligned to '{matched_status}'.")
                status = matched_status
            else:
                row_errors.append(f"Unknown Status '{status}'. Must be one of: {', '.join(valid_statuses)}")

        priority = clean_cell_text(canon_vals.get('priority')) or 'Medium'
        matched_priority = next((p for p in valid_priorities if p.lower() == priority.lower()), 'Medium')
        if matched_priority != priority:
            row_corrections.append(f"Priority '{priority}' defaulted to '{matched_priority}'.")
        priority = matched_priority

        raw_tool = clean_cell_text(canon_vals.get('tool')) or ''
        tool = NO_AI
        if raw_tool:
            if raw_tool.lower() in ('none', 'manual', 'no ai', 'no-ai', 'na', 'n/a', 'none (manual)', ''):
                tool = 'N/A' if raw_tool.upper() in ('N/A', 'NA') else NO_AI
            else:
                matched_tool = normalize_ai_tool(raw_tool, valid_ai_tools)
                if matched_tool:
                    if matched_tool != raw_tool:
                        row_corrections.append(f"AI Tool '{raw_tool}' aligned to '{matched_tool}'.")
                    tool = matched_tool
                else:
                    row_errors.append(f"Unknown AI Tool '{raw_tool}'. Must be one of: {', '.join(valid_ai_tools)}")
                    tool = raw_tool

        # D. Numeric Hours Validation
        raw_planned = canon_vals.get('planned')
        raw_actual = canon_vals.get('actual')
        raw_ai = canon_vals.get('aiHours')
        raw_manual = canon_vals.get('manualEffort')

        planned_val = 0.0
        actual_val = 0.0
        ai_val = 0.0

        if not is_valid_half_hour(raw_planned, min_val=0.5):
            row_errors.append(f"Planned Hours '{raw_planned}' must be > 0 and a multiple of 0.5 (e.g. 1.0, 1.5, 8.0).")
        else:
            planned_val = float(raw_planned)
            if planned_val > 24.0:
                row_errors.append("Planned Hours cannot exceed 24 hours.")

        if not is_valid_half_hour(raw_actual, min_val=0.0):
            row_errors.append(f"Actual Hours '{raw_actual}' must be >= 0 and a multiple of 0.5 (e.g. 0, 0.5, 4.0).")
        else:
            actual_val = float(raw_actual)
            if actual_val > 24.0:
                row_errors.append("Actual Hours cannot exceed 24 hours.")
            if status == 'Completed' and actual_val <= 0:
                row_errors.append("Completed tasks must have Actual Hours greater than 0.")

        if not is_valid_half_hour(raw_ai, min_val=0.0):
            row_errors.append(f"AI Hours '{raw_ai}' must be >= 0 and a multiple of 0.5.")
        else:
            ai_val = float(raw_ai)
            if ai_val > actual_val:
                row_errors.append(f"AI Hours ({ai_val}) cannot exceed Actual Hours ({actual_val}).")
            if tool == NO_AI and ai_val > 0:
                row_errors.append(f"AI Hours is {ai_val} but AI Tool is set to '{NO_AI}'. Select an AI tool or set AI Hours to 0.")

        # Authoritative Manual Effort calculation
        calculated_manual = max(0.0, round2(actual_val - ai_val))
        manual_val = calculated_manual
        if raw_manual is not None and str(raw_manual).strip() != '':
            try:
                provided_manual = float(raw_manual)
                if abs(provided_manual - calculated_manual) > 0.01:
                    row_corrections.append(f"Manual Effort recalculated from {provided_manual}h to {calculated_manual}h (Actual - AI).")
            except Exception:
                row_corrections.append(f"Manual Effort derived as {calculated_manual}h.")

        # Authoritative Derived Fields
        calc_res = calc_entry(planned_val, actual_val, ai_val, status)
        saved_val = calc_res['saved']
        savings_pct_val = calc_res['savingsPct']

        # E. Notes & Justification
        notes = clean_cell_text(canon_vals.get('notes'))
        if actual_val > planned_val and planned_val > 0 and not notes:
            row_errors.append("Notes/Justification is required because Actual Hours exceed Planned Hours.")

        # F. Duplicate Checks
        is_dup = False
        dup_key = f"{iso_date or ''}|{project.lower()}|{task_type.lower()}|{details.lower()}"
        if iso_date and project and task_type and details:
            if dup_key in seen_file_keys:
                is_dup = True
                row_errors.append(f"Duplicate entry: Identical to row {seen_file_keys[dup_key]} in this uploaded file.")
            elif dup_key in existing_dup_keys:
                is_dup = True
                row_errors.append(f"Potential conflict: Identical entry already exists in system for {emp['name']} (ID: {existing_dup_keys[dup_key]}).")
            else:
                seen_file_keys[dup_key] = idx

        # Determine Row Classification
        if row_errors:
            row_status = 'duplicate' if is_dup else 'invalid'
            if is_dup:
                duplicate_count += 1
            else:
                invalid_count += 1
        elif row_corrections:
            row_status = 'corrected'
            corrected_count += 1
        elif row_warnings:
            row_status = 'warning'
            warning_count += 1
        else:
            row_status = 'valid'
            valid_count += 1

        is_importable = (row_status in ('valid', 'corrected', 'warning')) and not is_dup

        parsed_data = {
            "date": iso_date or str(raw_date or ''),
            "month": final_month,
            "project": project,
            "module": module,
            "taskType": task_type,
            "details": details,
            "priority": priority,
            "status": status,
            "tool": tool,
            "planned": planned_val,
            "actual": actual_val,
            "aiHours": ai_val,
            "manual": manual_val,
            "saved": saved_val,
            "savingsPct": savings_pct_val,
            "notes": notes,
            "empId": target_emp_id
        }

        preview_rows.append({
            "rowNumber": idx,
            "originalData": {k: clean_cell_text(v) for k, v in raw_row.items()},
            "parsedData": parsed_data,
            "status": row_status,
            "errors": row_errors,
            "warnings": row_warnings,
            "corrections": row_corrections,
            "isDuplicate": is_dup,
            "isImportable": is_importable
        })

    importable_count = valid_count + corrected_count + warning_count
    import_id = str(uuid.uuid4())

    summary = {
        "totalRows": len(raw_rows),
        "validCount": valid_count,
        "correctedCount": corrected_count,
        "warningCount": warning_count,
        "invalidCount": invalid_count,
        "duplicateCount": duplicate_count,
        "importableCount": importable_count
    }

    # Store in session for confirmation
    import_sessions[import_id] = {
        "importId": import_id,
        "filename": filename,
        "employeeId": target_emp_id,
        "employeeName": emp['name'],
        "summary": summary,
        "rows": preview_rows,
        "createdAt": datetime.now()
    }

    return {
        "success": True,
        "importId": import_id,
        "filename": filename,
        "employeeId": target_emp_id,
        "employeeName": emp['name'],
        "employeeTeam": emp.get('team', ''),
        "summary": summary,
        "headersDetected": headers,
        "headersMapped": raw_to_canon,
        "unmappedHeaders": unmapped_headers,
        "rows": preview_rows
    }

def confirm_timesheet_import(
    import_id: str,
    target_emp_id: str,
    target_state: str = "Submitted",
    selected_duplicate_row_numbers: Optional[List[int]] = None
) -> Dict[str, Any]:
    db.load_data()
    session = import_sessions.get(import_id)
    if not session:
        return {
            "success": False,
            "error": "Import session not found or has expired. Please re-upload and validate the file."
        }

    if session["employeeId"] != target_emp_id:
        return {
            "success": False,
            "error": "Employee mismatch for this import session."
        }

    now = datetime.now().strftime("%Y-%m-%dT%H:%M")
    imported_entries = []
    skipped_count = 0
    selected_dups = set(selected_duplicate_row_numbers or [])

    for row in session["rows"]:
        is_selected_duplicate = (row.get("isDuplicate") or row.get("status") == "duplicate") and (row.get("rowNumber") in selected_dups)
        if not (row["isImportable"] or is_selected_duplicate):
            skipped_count += 1
            continue

        p = row["parsedData"]
        db.seq += 1
        new_id = f"T{db.seq}"

        entry_record = {
            "id": new_id,
            "empId": target_emp_id,
            "date": p["date"],
            "month": p["month"],
            "project": p["project"],
            "module": p.get("module", ""),
            "taskType": p["taskType"],
            "details": p["details"],
            "priority": p.get("priority", "Medium"),
            "planned": p["planned"],
            "actual": p["actual"],
            "aiHours": p["aiHours"],
            "tool": p["tool"],
            "status": p["status"],
            "notes": p.get("notes", ""),
            "state": target_state if target_state in ("Draft", "Submitted") else "Submitted",
            "submittedAt": now if target_state == "Submitted" else "",
            "createdAt": db.seq
        }

        db.entries.append(entry_record)
        imported_entries.append(entry_record)

    # Persist to SQL Server database
    db.save_seed_data()

    # Clear session
    import_sessions.pop(import_id, None)

    return {
        "success": True,
        "message": f"Successfully imported {len(imported_entries)} timesheet entries for {session['employeeName']}.",
        "importedCount": len(imported_entries),
        "skippedCount": skipped_count,
        "importedIds": [e["id"] for e in imported_entries],
        "entries": imported_entries
    }

def generate_sample_csv() -> str:
    """Generates a clean CSV sample template for managers to download"""
    headers = [
        "Date", "Project", "Module / Page", "Task Type", "Task Details",
        "Priority", "Status", "Planned Hours", "Actual Hours",
        "AI Effort / AI Hours", "AI Tool Used", "Notes / Justification"
    ]
    sample_rows = [
        ["2026-10-20", "Customer Portal", "Login Page", "Back-End Development", "Implement OAuth2 login with Azure AD", "High", "Completed", "8.0", "6.5", "2.0", "GitHub Copilot", ""],
        ["2026-10-21", "Analytics Hub", "Dashboard", "Bug Fixing", "Fix KPI metric calculation rounding error", "Critical", "Completed", "4.0", "4.0", "1.5", "Claude", ""],
        ["2026-10-22", "Mobile App", "Checkout", "Testing", "Write Cypress end-to-end integration tests", "Medium", "In Progress", "6.0", "5.0", "0.0", "ChatGPT", ""],
        ["2026-10-23", "Internal CRM", "User Profile", "Documentation", "Update technical user manual and API docs", "Low", "Completed", "4.0", "5.0", "1.0", "ChatGPT", "Required additional security review documentation"]
    ]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for r in sample_rows:
        writer.writerow(r)
    return output.getvalue()
