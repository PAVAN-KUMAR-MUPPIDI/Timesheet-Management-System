import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Employee, TimesheetEntry, FilterState, RoleType, ControlledItem, API_BASE_URL } from '../models/models';
import { CalculationService, NO_AI } from './calculation.service';

// Keep ONLY non-sensitive UI preferences in localStorage (e.g. view filters, selected period)
const PREF_KEY = 'team_productivity_ui_prefs_v1';

@Injectable({
  providedIn: 'root'
})
export class DataProviderService {
  private http = inject(HttpClient);

  private state = signal<{
    employees: Employee[];
    entries: TimesheetEntry[];
    seq: number;
    ui: FilterState;
  }>({
    employees: [],
    entries: [],
    seq: 1,
    ui: {
      role: 'employee',
      me: 'E01',
      period: 'Current Month',
      month: '2026-10',
      view: 'dash',
      mTeam: 'all',
      mEmp: 'all'
    }
  });

  readonly showAddEmployeeModal = signal<boolean>(false);
  readonly showUserProfileModal = signal<boolean>(false);

  // Dynamic Controlled Configuration Items (populated dynamically from backend database)
  readonly taskTypeItems = signal<ControlledItem[]>([]);
  readonly priorityItems = signal<ControlledItem[]>([]);
  readonly statusItems = signal<ControlledItem[]>([]);
  readonly aiToolItems = signal<ControlledItem[]>([]);
  readonly projectItems = signal<string[]>([]);
  readonly moduleItems = signal<string[]>([]);
  readonly teamItems = signal<string[]>([]);

  // Computed signals that expose ONLY ACTIVE items for employee dropdown selections
  readonly activeTaskTypes = computed(() => this.taskTypeItems().filter(i => i.status === 'Active').map(i => i.name));
  readonly activePriorities = computed(() => this.priorityItems().filter(i => i.status === 'Active').map(i => i.name));
  readonly activeStatuses = computed(() => this.statusItems().filter(i => i.status === 'Active').map(i => i.name));
  readonly activeAiTools = computed(() => this.aiToolItems().filter(i => i.status === 'Active').map(i => i.name));

  // Backward-compatible aliases for active names
  readonly taskTypes = this.activeTaskTypes;
  readonly priorities = this.activePriorities;
  readonly statuses = this.activeStatuses;
  readonly aiTools = this.activeAiTools;
  readonly projects = computed(() => this.projectItems());
  readonly modules = computed(() => this.moduleItems());
  readonly teams = computed(() => {
    const fromItems = this.teamItems();
    const list: string[] = [];
    if (Array.isArray(fromItems)) {
      for (const t of fromItems) {
        if (t && typeof t === 'string' && !list.includes(t)) {
          list.push(t);
        }
      }
    }
    for (const emp of this.state().employees) {
      if (emp.team && !list.includes(emp.team)) {
        list.push(emp.team);
      }
    }
    if (list.length === 0) {
      return ['Frontend', 'Backend', 'UX Design', 'QA'];
    }
    return list;
  });

  // Public computed signals for high performance
  readonly employees = computed(() => this.state().employees);
  readonly entries = computed(() => this.state().entries);
  readonly ui = computed(() => this.state().ui);

  readonly currentEmployee = computed(() => {
    const s = this.state();
    const found = s.employees.find(e => e.id === s.ui.me);
    if (found) return found;

    if (s.ui.me && s.ui.role === 'employee') {
      return {
        id: s.ui.me,
        name: s.ui.me,
        email: '',
        team: 'Backend',
        designation: 'Developer'
      };
    }

    return s.employees[0] || { id: 'E01', name: 'Employee', email: '', team: 'Backend', designation: 'Developer' };
  });

  readonly availableMonths = computed(() => {
    const set = new Set(this.state().entries.map(e => e.month));
    set.add(this.calcService.CUR_MONTH);
    return Array.from(set).filter(Boolean).sort();
  });

  constructor(private calcService: CalculationService) {
    this.cleanLegacyStorage();
    this.load();
    this.loadControlledConfig();
    this.loadEmployeesFromBackend();
    this.loadTimesheetsFromBackend();
  }

  /**
   * Cleans up all sensitive legacy storage keys from localStorage.
   */
  private cleanLegacyStorage(): void {
    try {
      const keysToRemove = [
        'team_productivity_hub_v1',
        'team_productivity_hub_v2',
        'team_productivity_hub_v3',
        'team_productivity_hub_v4',
        'team_productivity_hub_v5',
        'team_productivity_hub_v6',
        'team_productivity_hub_v7',
        'team_productivity_hub_v8',
        'team_productivity_hub_v9',
        'team_productivity_auth_v1',
        'team_productivity_auth_v2',
        'team_productivity_auth_v3',
        'team_productivity_auth_v4',
        'team_productivity_auth_v5',
        'team_productivity_auth_v6',
        'team_productivity_controlled_v1'
      ];
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  loadEmployeesFromBackend(): void {
    this.http.get<Employee[]>(`${API_BASE_URL}/reference/employees`).subscribe({
      next: (backendEmps) => {
        if (Array.isArray(backendEmps) && backendEmps.length > 0) {
          this.state.update(s => ({
            ...s,
            employees: backendEmps
          }));
          if (this.teamItems().length === 0) {
            const empTeams = Array.from(new Set(backendEmps.map(e => e.team).filter((t): t is string => Boolean(t))));
            if (empTeams.length > 0) {
              this.teamItems.set(empTeams);
            }
          }
        }
      },
      error: (err) => {
        console.warn('Backend reference/employees not reachable:', err);
      }
    });
  }

  private normalizeControlledList(raw: any[]): ControlledItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(x => {
      if (typeof x === 'object' && x !== null) {
        return {
          name: String(x.name || '').trim(),
          status: (x.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive'
        };
      }
      return {
        name: String(x || '').trim(),
        status: 'Active' as const
      };
    }).filter(x => x.name.length > 0);
  }

  loadControlledConfig(): void {
    this.http.get<any>(`${API_BASE_URL}/reference/config`).subscribe({
      next: (cfg) => {
        if (cfg) {
          if (Array.isArray(cfg.taskTypes) && cfg.taskTypes.length > 0) {
            this.taskTypeItems.set(this.normalizeControlledList(cfg.taskTypes));
          }
          if (Array.isArray(cfg.priorities) && cfg.priorities.length > 0) {
            this.priorityItems.set(this.normalizeControlledList(cfg.priorities));
          }
          if (Array.isArray(cfg.statuses) && cfg.statuses.length > 0) {
            this.statusItems.set(this.normalizeControlledList(cfg.statuses));
          }
          if (Array.isArray(cfg.aiTools) && cfg.aiTools.length > 0) {
            const list = this.normalizeControlledList(cfg.aiTools).filter(i => i.name !== 'None (Manual)' && i.name !== NO_AI && i.name !== 'N/A');
            this.aiToolItems.set(list);
          }
          if (Array.isArray(cfg.projects) && cfg.projects.length > 0) {
            this.projectItems.set(cfg.projects);
          }
          if (Array.isArray(cfg.modules) && cfg.modules.length > 0) {
            this.moduleItems.set(cfg.modules);
          }
          if (Array.isArray(cfg.teams) && cfg.teams.length > 0) {
            this.teamItems.set(cfg.teams);
          }
        }
      },
      error: (err) => console.warn('Could not load controlled config from API, using defaults:', err)
    });

    this.http.get<string[]>(`${API_BASE_URL}/reference/teams`).subscribe({
      next: (teams) => {
        if (Array.isArray(teams) && teams.length > 0) {
          this.teamItems.set(teams);
        }
      },
      error: () => {}
    });
  }

  addControlledField(category: string, value: string): void {
    const val = value.trim();
    if (!val) return;

    // Optimistic UI update immediately (defaulting new item to Inactive)
    const newItem: ControlledItem = { name: val, status: 'Inactive' };
    if (category === 'taskTypes') {
      const cur = this.taskTypeItems();
      if (!cur.some(x => x.name.toLowerCase() === val.toLowerCase())) {
        this.taskTypeItems.set([...cur, newItem]);
      }
    } else if (category === 'priorities') {
      const cur = this.priorityItems();
      if (!cur.some(x => x.name.toLowerCase() === val.toLowerCase())) {
        this.priorityItems.set([...cur, newItem]);
      }
    } else if (category === 'statuses') {
      const cur = this.statusItems();
      if (!cur.some(x => x.name.toLowerCase() === val.toLowerCase())) {
        this.statusItems.set([...cur, newItem]);
      }
    } else if (category === 'aiTools') {
      const cur = this.aiToolItems();
      if (!cur.some(x => x.name.toLowerCase() === val.toLowerCase())) {
        this.aiToolItems.set([...cur, newItem]);
      }
    }

    this.http.post<any>(`${API_BASE_URL}/reference/config/add`, { category, value: val }).subscribe({
      next: (res) => {
        if (res && res.success && res.values) {
          const normalized = this.normalizeControlledList(res.values);
          if (category === 'taskTypes') this.taskTypeItems.set(normalized);
          else if (category === 'priorities') this.priorityItems.set(normalized);
          else if (category === 'statuses') this.statusItems.set(normalized);
          else if (category === 'aiTools') this.aiToolItems.set(normalized.filter(i => i.name !== 'None (Manual)' && i.name !== NO_AI && i.name !== 'N/A'));
        }
      },
      error: (err) => console.warn('Failed to add controlled field:', err)
    });
  }

  toggleControlledStatus(category: string, value: string, targetStatus?: string): void {
    const val = value.trim();
    if (!val) return;

    const updater = (items: ControlledItem[]) => items.map(item => {
      if (item.name.toLowerCase() === val.toLowerCase()) {
        const nextStatus = targetStatus ? (targetStatus as 'Active' | 'Inactive') : (item.status === 'Active' ? 'Inactive' : 'Active');
        return { ...item, status: nextStatus };
      }
      return item;
    });

    if (category === 'taskTypes') this.taskTypeItems.update(updater);
    else if (category === 'priorities') this.priorityItems.update(updater);
    else if (category === 'statuses') this.statusItems.update(updater);
    else if (category === 'aiTools') this.aiToolItems.update(updater);

    this.http.post<any>(`${API_BASE_URL}/reference/config/toggle-status`, { category, value: val, status: targetStatus }).subscribe({
      next: (res) => {
        if (res && res.success && res.values) {
          const normalized = this.normalizeControlledList(res.values);
          if (category === 'taskTypes') this.taskTypeItems.set(normalized);
          else if (category === 'priorities') this.priorityItems.set(normalized);
          else if (category === 'statuses') this.statusItems.set(normalized);
          else if (category === 'aiTools') this.aiToolItems.set(normalized.filter(i => i.name !== 'None (Manual)' && i.name !== NO_AI && i.name !== 'N/A'));
        }
      },
      error: (err) => console.warn('Failed to toggle controlled field status:', err)
    });
  }

  deleteControlledField(category: string, value: string): void {
    const val = value.trim();
    if (!val) return;

    const filterer = (items: ControlledItem[]) => items.filter(x => x.name.toLowerCase() !== val.toLowerCase());
    if (category === 'taskTypes') this.taskTypeItems.update(filterer);
    else if (category === 'priorities') this.priorityItems.update(filterer);
    else if (category === 'statuses') this.statusItems.update(filterer);
    else if (category === 'aiTools') this.aiToolItems.update(filterer);

    this.http.post<any>(`${API_BASE_URL}/reference/config/delete`, { category, value: val }).subscribe({
      next: (res) => {
        if (res && res.success && res.values) {
          const normalized = this.normalizeControlledList(res.values);
          if (category === 'taskTypes') this.taskTypeItems.set(normalized);
          else if (category === 'priorities') this.priorityItems.set(normalized);
          else if (category === 'statuses') this.statusItems.set(normalized);
          else if (category === 'aiTools') this.aiToolItems.set(normalized.filter(i => i.name !== 'None (Manual)' && i.name !== NO_AI && i.name !== 'N/A'));
        }
      },
      error: (err) => console.warn('Failed to delete controlled field:', err)
    });
  }

  importEntries(newEntries: TimesheetEntry[]): void {
    if (!newEntries || newEntries.length === 0) return;
    this.state.update(s => {
      const existingIds = new Set(s.entries.map(e => e.id));
      const filtered = newEntries.filter(e => !existingIds.has(e.id));
      return {
        ...s,
        entries: [...s.entries, ...filtered],
        seq: Math.max(s.seq, s.entries.length + filtered.length + 100)
      };
    });
  }

  seed(): { employees: Employee[]; entries: TimesheetEntry[]; seq: number; ui: FilterState } {
    return {
      employees: [],
      entries: [],
      seq: 1,
      ui: {
        role: 'employee',
        me: 'E01',
        period: 'Current Month',
        month: this.calcService.CUR_MONTH,
        view: 'dash',
        mTeam: 'all',
        mEmp: 'all'
      }
    };
  }

  /**
   * Loads non-sensitive UI preferences from localStorage (e.g. view filters).
   */
  load(): void {
    try {
      const s = localStorage.getItem(PREF_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') {
          this.state.update(cur => ({
            ...cur,
            ui: {
              ...cur.ui,
              period: parsed.period || cur.ui.period,
              month: parsed.month || cur.ui.month,
              view: parsed.view || cur.ui.view,
              mTeam: parsed.mTeam || cur.ui.mTeam,
              mEmp: parsed.mEmp || cur.ui.mEmp
            }
          }));
          return;
        }
      }
    } catch (e) {
      console.warn('LocalStorage load failed, using initial state:', e);
    }
    const fresh = this.seed();
    this.state.set(fresh);
  }

  /**
   * Persists only non-sensitive UI preferences to localStorage.
   * Security Critical: Never stores employee records, roles, entries, or auth data.
   */
  save(): void {
    try {
      const uiPrefs = {
        period: this.state().ui.period,
        month: this.state().ui.month,
        view: this.state().ui.view,
        mTeam: this.state().ui.mTeam,
        mEmp: this.state().ui.mEmp
      };
      localStorage.setItem(PREF_KEY, JSON.stringify(uiPrefs));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  updateUI(partial: Partial<FilterState>): void {
    if (partial.period) {
      if (partial.period === 'Current Month') {
        partial.month = this.calcService.CUR_MONTH;
      } else if (partial.period === 'Last Month') {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        partial.month = this.calcService.iso(d).slice(0, 7);
      } else if (partial.period === 'Custom Month' && !partial.month) {
        partial.month = this.calcService.CUR_MONTH;
      }
    }

    this.state.update(s => ({
      ...s,
      ui: { ...s.ui, ...partial }
    }));
    this.save();
  }

  addEntry(entry: Omit<TimesheetEntry, 'id' | 'createdAt'>): TimesheetEntry {
    const nextSeq = this.state().seq + 1;
    const newId = 'T' + nextSeq;
    const full: TimesheetEntry = {
      ...entry,
      id: newId,
      createdAt: nextSeq
    };

    this.state.update(st => ({
      ...st,
      entries: [full, ...st.entries],
      seq: nextSeq
    }));

    this.http.post<any>(`${API_BASE_URL}/timesheets`, full).subscribe({
      next: (created) => {
        if (created && created.id && created.id !== newId) {
          this.state.update(st => ({
            ...st,
            entries: st.entries.map(x => x.id === newId ? { ...x, id: created.id } : x)
          }));
        }
      },
      error: (err) => console.warn('Failed to sync new timesheet entry to backend:', err)
    });

    return full;
  }

  updateEntry(id: string, partial: Partial<TimesheetEntry>): boolean {
    let found = false;
    this.state.update(s => {
      const idx = s.entries.findIndex(e => e.id === id);
      if (idx === -1) return s;
      found = true;
      const updated = [...s.entries];
      const cur = updated[idx];
      const nextDate = partial.date !== undefined ? partial.date : cur.date;
      updated[idx] = {
        ...cur,
        ...partial,
        month: nextDate.slice(0, 7)
      };
      return { ...s, entries: updated };
    });
    if (found) {
      const payload: any = {
        ...partial,
        month: partial.date ? partial.date.slice(0, 7) : undefined
      };
      this.http.put(`${API_BASE_URL}/timesheets/${id}`, payload).subscribe({
        next: () => {},
        error: (err) => console.warn(`Failed to sync update of ${id} to backend:`, err)
      });
    }
    return found;
  }

  deleteEntry(id: string): void {
    const entry = this.state().entries.find(e => e.id === id);
    if (entry && entry.state === 'Submitted') {
      alert('Submitted timesheet entries are locked for compliance and audit integrity and cannot be deleted.');
      return;
    }

    this.state.update(s => ({
      ...s,
      entries: s.entries.filter(e => e.id !== id)
    }));

    this.http.delete(`${API_BASE_URL}/timesheets/${id}`).subscribe({
      next: () => {},
      error: (err) => console.warn(`Failed to sync deletion of ${id} to backend:`, err)
    });
  }

  deleteSelectedEntries(entryIds: string[]): { successCount: number; blockedCount: number } {
    if (!entryIds || entryIds.length === 0) return { successCount: 0, blockedCount: 0 };

    const idsSet = new Set(entryIds);
    const toDelete: string[] = [];
    let blockedCount = 0;

    for (const e of this.state().entries) {
      if (idsSet.has(e.id)) {
        if (e.state === 'Submitted') {
          blockedCount++;
        } else {
          toDelete.push(e.id);
        }
      }
    }

    if (toDelete.length > 0) {
      const deleteSet = new Set(toDelete);
      this.state.update(s => ({
        ...s,
        entries: s.entries.filter(e => !deleteSet.has(e.id))
      }));

      this.http.post<any>(`${API_BASE_URL}/timesheets/delete-selected`, { entry_ids: toDelete }).subscribe({
        next: () => {},
        error: () => {
          toDelete.forEach(id => {
            this.http.delete(`${API_BASE_URL}/timesheets/${id}`).subscribe();
          });
        }
      });
    }

    return { successCount: toDelete.length, blockedCount };
  }

  submitSelectedEntries(entryIds: string[]): number {
    if (!entryIds || entryIds.length === 0) return 0;

    const idsSet = new Set(entryIds);
    let count = 0;
    const now = new Date().toISOString();

    this.state.update(s => {
      const updated = s.entries.map(e => {
        if (idsSet.has(e.id) && e.state === 'Draft') {
          count++;
          return {
            ...e,
            state: 'Submitted' as const,
            submittedAt: now
          };
        }
        return e;
      });
      return { ...s, entries: updated };
    });

    if (count > 0) {
      this.http.post(`${API_BASE_URL}/timesheets/submit-selected`, { entry_ids: entryIds }).subscribe({
        next: () => {},
        error: () => {
          const payload = {
            state: 'Submitted',
            submittedAt: now
          };
          entryIds.forEach(id => {
            this.http.put(`${API_BASE_URL}/timesheets/${id}`, payload).subscribe();
          });
        }
      });
    }

    return count;
  }

  submitSelected(entryIds: string[]): number {
    return this.submitSelectedEntries(entryIds);
  }

  deleteSelected(entryIds: string[]): { successCount: number; blockedCount: number } {
    return this.deleteSelectedEntries(entryIds);
  }

  submitMonth(empId: string, month: string): number {
    let count = 0;
    const now = new Date().toISOString();
    this.state.update(s => {
      const updated = s.entries.map(e => {
        if (e.empId === empId && e.month === month && e.state === 'Draft') {
          count++;
          return {
            ...e,
            state: 'Submitted' as const,
            submittedAt: now
          };
        }
        return e;
      });
      return { ...s, entries: updated };
    });

    this.http.post(`${API_BASE_URL}/timesheets/submit-month?emp_id=${empId}&month=${month}`, {}).subscribe({
      next: () => {},
      error: (err) => console.warn(`Failed to sync submit month to backend:`, err)
    });

    return count;
  }

  addEmployee(data: { name: string; email: string; team: string; designation: string; password?: string }): Employee {
    const currentEmployees = this.state().employees;
    const nums = currentEmployees
      .map(e => parseInt(e.id.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : currentEmployees.length + 1;
    const newId = 'E' + (nextNum < 10 ? '0' + nextNum : nextNum);

    const cleanName = data.name.trim();
    const cleanEmail = data.email.trim().toLowerCase();
    const firstWord = cleanName ? cleanName.split(' ')[0].toLowerCase() : 'name';
    const cleanPwd = (data.password && data.password.trim()) ? data.password.trim() : `${firstWord}@1234`;

    const newEmp: Employee = {
      id: newId,
      name: cleanName,
      email: cleanEmail,
      team: data.team,
      designation: data.designation.trim()
    };

    this.state.update(s => ({
      ...s,
      employees: [...s.employees.filter(e => (e.email || '').toLowerCase() !== (newEmp.email || '').toLowerCase()), newEmp]
    }));

    this.http.post<any>(`${API_BASE_URL}/reference/employees`, {
      name: newEmp.name,
      email: newEmp.email,
      team: newEmp.team,
      designation: newEmp.designation,
      password: cleanPwd
    }).subscribe({
      next: () => {
        this.loadEmployeesFromBackend();
      },
      error: (err) => {
        console.warn('Backend add employee error:', err);
      }
    });

    return newEmp;
  }

  resetDemo(): void {
    this.http.post(`${API_BASE_URL}/demo/reset`, {}).subscribe({
      next: () => {
        this.loadEmployeesFromBackend();
        this.loadTimesheetsFromBackend();
      },
      error: () => {
        this.loadEmployeesFromBackend();
        this.loadTimesheetsFromBackend();
      }
    });
  }

  saveTimesheet(entry: Partial<TimesheetEntry>, isSubmit: boolean, editId?: string): TimesheetEntry | boolean {
    const dateStr = entry.date || this.calcService.TODAY;
    const monthStr = dateStr.slice(0, 7);
    const now = new Date().toISOString();

    const rec: any = {
      ...entry,
      date: dateStr,
      month: monthStr,
      empId: entry.empId || this.state().ui.me
    };

    if (isSubmit) {
      rec.state = 'Submitted';
      rec.submittedAt = now;
    } else {
      rec.state = 'Draft';
      rec.submittedAt = '';
    }
    if (editId) {
      return this.updateEntry(editId, rec);
    } else {
      return this.addEntry(rec);
    }
  }

  saveEntry(entry: Partial<TimesheetEntry>, isSubmitOrMode: boolean | 'draft' | 'submit', editId?: string | null): TimesheetEntry | boolean {
    const isSubmit = isSubmitOrMode === true || isSubmitOrMode === 'submit';
    return this.saveTimesheet(entry, isSubmit, editId || undefined);
  }

  setManagerRole(): void {
    this.updateUI({ role: 'manager' });
    this.loadEmployeesFromBackend();
    this.loadTimesheetsFromBackend();
  }

  setEmployeeRole(empId: string, empData?: Partial<Employee>): void {
    this.updateUI({ role: 'employee', me: empId });
    if (empData) {
      this.state.update(s => {
        const existing = s.employees.find(e => e.id === empId);
        if (!existing) {
          const newEmp: Employee = {
            id: empId,
            name: empData.name || empId,
            email: empData.email || '',
            team: empData.team || 'Backend',
            designation: empData.designation || 'Developer'
          };
          return { ...s, employees: [...s.employees, newEmp] };
        }
        return s;
      });
    }
    this.loadEmployeesFromBackend();
    this.loadTimesheetsFromBackend(empId);
  }

  updateEmployee(id: string, partial: Partial<Employee>): void {
    this.state.update(s => ({
      ...s,
      employees: s.employees.map(e => e.id === id ? { ...e, ...partial } : e)
    }));
  }

  loadTimesheetsFromBackend(empId?: string): void {
    const targetEmp = empId && empId !== 'all' ? empId : (this.state().ui?.role === 'employee' ? this.state().ui?.me : undefined);
    const url = targetEmp
      ? `${API_BASE_URL}/timesheets?emp_id=${targetEmp}`
      : `${API_BASE_URL}/timesheets`;

    this.http.get<TimesheetEntry[]>(url).subscribe({
      next: (backendEntries) => {
        if (Array.isArray(backendEntries)) {
          this.state.update(s => {
            const isEmp = s.ui?.role === 'employee';
            let merged: TimesheetEntry[];
            if (isEmp && targetEmp) {
              merged = backendEntries.filter(e => e.empId === targetEmp);
            } else if (targetEmp) {
              const others = (s.entries || []).filter(e => e.empId !== targetEmp);
              merged = [...others, ...backendEntries];
            } else {
              merged = backendEntries;
            }

            let activeMonth = this.calcService.CUR_MONTH;
            const currentEmp = targetEmp || s.ui.me;
            const empEntries = merged.filter(e => e.empId === currentEmp);
            if (empEntries.length > 0) {
              const monthsWithData = Array.from(new Set(empEntries.map(e => e.month))).sort();
              const hasDataInCurrentMonth = empEntries.some(e => e.month === activeMonth);
              if (!hasDataInCurrentMonth && monthsWithData.length > 0) {
                activeMonth = monthsWithData[monthsWithData.length - 1];
              }
            } else {
              activeMonth = this.calcService.CUR_MONTH;
            }

            return {
              ...s,
              entries: merged,
              seq: Math.max(s.seq, merged.length + 100),
              ui: {
                ...s.ui,
                month: activeMonth
              }
            };
          });
        }
      },
      error: (err) => console.warn('Could not fetch timesheets from backend:', err)
    });
  }
}
