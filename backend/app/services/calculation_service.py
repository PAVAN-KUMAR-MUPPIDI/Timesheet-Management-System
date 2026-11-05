import math
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Set, Optional

NO_AI = ''
PERIOD_OPTIONS = ['Current Week', 'Last Week', 'Current Month', 'Last Month']

def get_period_range(period: str, ref_date: Optional[date] = None) -> Dict[str, str]:
    if ref_date is None:
        ref_date = datetime.now().date()
    
    if period == 'Current Week':
        start = ref_date - timedelta(days=ref_date.weekday())
        end = start + timedelta(days=6)
        return {
            "period": period,
            "start": start.strftime('%Y-%m-%d'),
            "end": end.strftime('%Y-%m-%d'),
            "label": f"Week of {start.strftime('%b %d')} - {end.strftime('%b %d, %Y')}"
        }
    elif period == 'Last Week':
        current_monday = ref_date - timedelta(days=ref_date.weekday())
        start = current_monday - timedelta(days=7)
        end = start + timedelta(days=6)
        return {
            "period": period,
            "start": start.strftime('%Y-%m-%d'),
            "end": end.strftime('%Y-%m-%d'),
            "label": f"Week of {start.strftime('%b %d')} - {end.strftime('%b %d, %Y')}"
        }
    elif period == 'Last Month':
        first_of_curr = ref_date.replace(day=1)
        last_of_prev = first_of_curr - timedelta(days=1)
        first_of_prev = last_of_prev.replace(day=1)
        return {
            "period": period,
            "start": first_of_prev.strftime('%Y-%m-%d'),
            "end": last_of_prev.strftime('%Y-%m-%d'),
            "label": first_of_prev.strftime('%B %Y')
        }
    else:
        start = ref_date.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        end = next_month - timedelta(days=1)
        return {
            "period": "Current Month",
            "start": start.strftime('%Y-%m-%d'),
            "end": end.strftime('%Y-%m-%d'),
            "label": start.strftime('%B %Y')
        }

def filter_by_period(entries: List[Dict[str, Any]], period_or_month: Optional[str] = None, ref_date: Optional[date] = None) -> List[Dict[str, Any]]:
    if not period_or_month or period_or_month == "all":
        return entries
    if period_or_month in PERIOD_OPTIONS:
        rng = get_period_range(period_or_month, ref_date)
        s, e = rng["start"], rng["end"]
        return [entry for entry in entries if s <= str(entry.get("date", "")) <= e]
    return [entry for entry in entries if str(entry.get("month", "")) == period_or_month or str(entry.get("date", "")).startswith(period_or_month)]

def safe_pct(a: float, b: float) -> float:
    return (a / b * 100.0) if (b > 0 and math.isfinite(a)) else 0.0

def round2(val: float) -> float:
    return round(float(val or 0), 2)

def is_ai(tool: str) -> bool:
    return bool(tool and tool != NO_AI and tool != 'None (Manual)' and tool != 'None')

def calc_entry(planned: float, actual: float, ai_hours: float, status: str) -> Dict[str, Any]:
    p = max(0.0, float(planned or 0))
    a = max(0.0, float(actual or 0))
    ai = max(0.0, float(ai_hours or 0))
    manual = max(0.0, a - ai)
    applicable = (p > 0 and a > 0)
    saved = (p - a) if applicable else 0.0
    savings_pct = safe_pct(saved, p) if applicable else 0.0
    return {
        "planned": round2(p),
        "actual": round2(a),
        "ai": round2(ai),
        "manual": round2(manual),
        "saved": round2(saved),
        "savingsPct": round2(savings_pct),
        "applicable": applicable
    }

def is_complete_entry(e: Dict[str, Any]) -> bool:
    details = str(e.get("details") or "").strip()
    planned = float(e.get("planned") or 0)
    actual = e.get("actual")
    ai_hours = float(e.get("aiHours") or 0)
    tool = str(e.get("tool") or "").strip()
    tool_ok = bool(tool) if ai_hours > 0 else True
    return bool(
        e.get("date") and e.get("project") and e.get("taskType") and details and e.get("status") and tool_ok
        and planned > 0 and actual is not None and str(actual) != ''
    )

def dup_key(e: Dict[str, Any]) -> str:
    emp = str(e.get("empId") or "").lower()
    dt = str(e.get("date") or "").lower()
    proj = str(e.get("project") or "").lower()
    mod = str(e.get("module") or "").lower()
    tt = str(e.get("taskType") or "").lower()
    det = str(e.get("details") or "").strip().lower()
    return f"{emp}|{dt}|{proj}|{mod}|{tt}|{det}"

def annotate_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Set[str] = set()
    sorted_entries = sorted(entries, key=lambda x: x.get("createdAt", 0))
    for e in sorted_entries:
        inc = not is_complete_entry(e)
        k = dup_key(e)
        dup = (not inc) and (k in seen)
        if not inc and not dup:
            seen.add(k)
        e["_inc"] = inc
        e["_dup"] = dup
    return sorted_entries

def aggregate_entries(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    valid_list = [e for e in entries if not e.get("_dup") and not e.get("_inc")]
    r = {
        "tasks": len(valid_list),
        "planned": 0.0,
        "actual": 0.0,
        "ai": 0.0,
        "manual": 0.0,
        "saved": 0.0,
        "plannedApp": 0.0,
        "completed": 0,
        "aiTasks": 0,
        "aiSaved": 0.0,
        "aiPlannedApp": 0.0,
        "toolCounts": {},
        "sumPct": 0.0,
        "nPct": 0
    }
    for e in valid_list:
        c = calc_entry(e.get("planned", 0), e.get("actual", 0), e.get("aiHours", 0), e.get("status", ""))
        r["planned"] += c["planned"]
        r["actual"] += c["actual"]
        r["ai"] += c["ai"]
        r["manual"] += c["manual"]
        r["saved"] += c["saved"]
        if c["applicable"]:
            r["plannedApp"] += c["planned"]
            r["sumPct"] += c["savingsPct"]
            r["nPct"] += 1
        if e.get("status") == 'Completed':
            r["completed"] += 1
        tool = e.get("tool") or NO_AI
        if is_ai(tool):
            r["aiTasks"] += 1
            r["toolCounts"][tool] = r["toolCounts"].get(tool, 0) + 1
            if c["applicable"]:
                r["aiSaved"] += c["saved"]
                r["aiPlannedApp"] += c["planned"]

    r["avgSavings"] = round2(r["sumPct"] / r["nPct"]) if r["nPct"] > 0 else 0.0
    r["efficiency"] = round2(safe_pct(r["saved"], r["plannedApp"]))
    r["completionRate"] = round2(safe_pct(r["completed"], r["tasks"]))
    r["adoption"] = round2(safe_pct(r["aiTasks"], r["tasks"]))
    
    top_tool = max(r["toolCounts"].items(), key=lambda x: x[1]) if r["toolCounts"] else None
    r["topTool"] = top_tool[0] if top_tool else "—"
    r["topCount"] = top_tool[1] if top_tool else 0
    r["toolsUsed"] = list(r["toolCounts"].keys())
    r["variance"] = round2(r["actual"] - r["planned"])
    return r
