import { Component, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService, NO_AI } from '../../../core/services/calculation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';
import { TimesheetEntry } from '../../../core/models/models';

@Component({
  selector: 'app-employee-timesheet',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatCheckboxModule, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>My Timesheet</h2>
        <p>Log daily tasks for {{ calcService.mLong(ui().month) }} · entries save as drafts until you submit</p>
      </div>
      <div class="sp"></div>
      <label class="ctl" style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px;">
        Month:
        <select [ngModel]="ui().month" (ngModelChange)="onMonthChange($event)" style="padding:7px 12px; border-radius:8px; border:1px solid var(--line); font-size:13px; background:#fff; font-weight:500; color:#0f172a;">
          <option *ngFor="let m of availableMonths()" [value]="m">{{ calcService.mLong(m) }} ({{ m }})</option>
        </select>
      </label>
    </div>

    <!-- Entry Form Card -->
    <form class="card" id="tsForm" [formGroup]="tsForm" autocomplete="off" (ngSubmit)="$event.preventDefault()" style="margin-bottom:16px">
      <div class="card-h">
        <h3>{{ editId ? 'Edit Timesheet Entry' : 'New Timesheet Entry' }}</h3>
        <span class="badge" *ngIf="editEntry" [class.ok]="editEntry.state === 'Submitted'" [class.mute]="editEntry.state === 'Draft'">{{ editEntry.state }}</span>
        <span class="sub">Fields marked <span style="color:var(--bad)">*</span> are required · calculated fields update automatically</span>
      </div>

      <datalist id="dlProj"><option *ngFor="let p of projects()" [value]="p"></datalist>
      <datalist id="dlMod"><option *ngFor="let m of modules()" [value]="m"></datalist>

      <div class="fgrid">
        <div class="f"><label>Date <em>*</em></label><input type="date" formControlName="date" [max]="calcService.TODAY"></div>
        <div class="f"><label>Month <span class="calc-pill">auto</span></label><input type="text" readonly [value]="calcService.mLong(tsForm.get('date')?.value?.slice(0, 7) || '')"></div>
        <div class="f"><label>Project <em>*</em></label><input type="text" formControlName="project" list="dlProj" placeholder="Select or type"></div>
        <div class="f"><label>Module / Page</label><input type="text" formControlName="module" list="dlMod" placeholder="e.g. Checkout"></div>
        <div class="f">
          <label>Task Type <em>*</em></label>
          <select formControlName="taskType"><option value="">Select…</option><option *ngFor="let t of taskTypes()" [value]="t">{{ t }}</option></select>
        </div>
        <div class="f">
          <label>Priority</label>
          <select formControlName="priority"><option *ngFor="let p of priorities()" [value]="p">{{ p }}</option></select>
        </div>
        <div class="f">
          <label>Status <em>*</em></label>
          <select formControlName="status"><option *ngFor="let s of statuses()" [value]="s">{{ s }}</option></select>
        </div>
        <div class="f">
          <label>AI Tool Used <em>*</em></label>
          <select formControlName="tool" (change)="onToolChange()"><option *ngFor="let t of tools()" [value]="t">{{ t }}</option></select>
        </div>
        <div class="f s4"><label>Task Details <em>*</em></label><textarea formControlName="details" placeholder="What did you work on?"></textarea></div>
        <div class="f"><label>Planned Hours <em>*</em></label><input type="number" formControlName="planned" min="0" step="0.5" (blur)="onHoursBlur('planned')"></div>
        <div class="f"><label>Actual Hours <em>*</em></label><input type="number" formControlName="actual" min="0" step="0.5" (input)="onHoursChange('actual')" (blur)="onHoursBlur('actual')"></div>
        <div class="f"><label>AI Effort / AI Hours</label><input type="number" formControlName="aiHours" min="0" step="0.5" (input)="onHoursChange('aiHours')" (blur)="onHoursBlur('aiHours')"></div>
        <div class="f"><label>Manual Effort</label><input type="number" formControlName="manualEffort" min="0" step="0.5" (input)="onHoursChange('manualEffort')" (blur)="onHoursBlur('manualEffort')"></div>
        <div class="f"><label>Effort Saved <span class="calc-pill">auto</span></label><input type="text" readonly [value]="calcResult().applicable ? calcResult().saved + ' h' : '0 h'"></div>
        <div class="f"><label>Savings % <span class="calc-pill">auto</span></label><input type="text" readonly [value]="calcService.fp(calcResult().savingsPct)"></div>
        <div class="f s2">
          <label>Notes / Justification <span style="color:var(--bad)">{{ isJustificationRequired ? '* required (over plan)' : '' }}</span></label>
          <textarea formControlName="notes" placeholder="Required when actual exceeds planned hours"></textarea>
        </div>
      </div>

      <div class="form-err" *ngIf="formErrors.length > 0">
        <div *ngFor="let err of formErrors">{{ err }}</div>
      </div>

      <div class="form-actions">
        <button class="btn ghost" type="button" *ngIf="editId" (click)="cancelEdit()">Cancel</button>
        <button class="btn ghost" type="button" *ngIf="!editId" (click)="clearForm()">Clear</button>
        <button class="btn ghost" type="button" (click)="save('draft')">
          {{ editId ? 'Update as draft' : 'Save as draft' }}
        </button>
        <button class="btn" type="button" (click)="save('submit')">
          {{ editId ? 'Update & Submit' : 'Save & submit' }}
        </button>
      </div>
    </form>

    <!-- Weekly Filter Ribbon -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-h">
        <h3>Weekly View</h3>
        <span class="sub">Click a week to filter the entries below</span>
      </div>
      <div class="weeks">
        <div class="wk" [class.on]="selectedWeek === 'all'" (click)="selectWeek('all')">
          <div class="h">ALL WEEKS</div>
          <div class="b"><b>{{ allEntries().length }}</b> tasks · {{ calcService.fh(aggAll().actual) }}h</div>
        </div>
        <div class="wk" *ngFor="let w of weeks()" [class.on]="selectedWeek === w" (click)="selectWeek(w)">
          <div class="h">WEEK OF {{ calcService.fDate(w).toUpperCase() }}</div>
          <div class="b"><b>{{ getWeekAgg(w).tasks }}</b> tasks · P {{ calcService.fh(getWeekAgg(w).planned) }}h / A {{ calcService.fh(getWeekAgg(w).actual) }}h</div>
        </div>
      </div>
      
      <!-- Table with Angular Material Select Checkbox and Native Action Buttons -->
      <app-data-table
        title="Timesheet Entries"
        [pageSize]="15"
        [cols]="tableCols"
        [rows]="filteredTableRows"
        [selectedIds]="selectedEntryIds"
        (selectChange)="onSelectChange($event)"
        (selectAllChange)="onSelectAllChange($event)"
        (edit)="onEditEntry($event)"
        (delete)="onDeleteEntry($event)"
        emptyMsg="No entries for this period yet — add your first task above."
        foot="Duplicate & incomplete entries are struck through and excluded from all metrics">
      </app-data-table>

      <!-- Weekly View Bottom Submit Button -->
      <div class="weekly-view-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:14px; border-top:1px solid var(--border)">
        <div style="display:flex; align-items:center; gap:12px">
          <button class="btn sm ghost" type="button" (click)="toggleSelectAllDrafts()">
            {{ areAllDraftsSelected() ? 'Deselect all drafts' : 'Select all drafts' }}
          </button>
          <span class="sub" style="font-size:13px; color:var(--muted)">
            <b>{{ selectedEntryIds.size }}</b> draft entry(ies) selected for submission
          </span>
        </div>
        <div style="display:flex; align-items:center; gap:10px">
          <button
            *ngIf="selectedEntryIds.size > 0"
            class="btn danger"
            type="button"
            (click)="deleteSelectedRecords()">
            Delete {{ selectedEntryIds.size === 1 ? 'Record' : 'Records' }} ({{ selectedEntryIds.size }})
          </button>
          <button class="btn" [disabled]="selectedEntryIds.size === 0" (click)="submitSelectedTimesheets()">
            Submit Timesheet
          </button>
        </div>
      </div>
    </div>
  `
})
export class TimesheetComponent implements OnInit {
  fb = inject(FormBuilder);
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);
  notification = inject(NotificationService);

  ui = this.dataService.ui;
  emp = this.dataService.currentEmployee;
  availableMonths = this.dataService.availableMonths;

  onMonthChange(m: string): void {
    this.dataService.updateUI({ month: m, editId: null });
  }

  projects = this.dataService.projects;
  modules = this.dataService.modules;
  taskTypes = this.dataService.activeTaskTypes;
  priorities = this.dataService.activePriorities;
  statuses = this.dataService.activeStatuses;
  tools = computed(() => {
    const list = this.dataService.activeAiTools();
    return ['N/A', ...list.filter(t => t !== 'N/A' && t !== NO_AI)];
  });

  selectedWeek = 'all';
  formErrors: string[] = [];
  selectedEntryIds = new Set<string>();

  // Tracks the order of user-edited fields to auto-calculate the 3rd field
  editHistory: ('actual' | 'aiHours' | 'manualEffort')[] = ['aiHours', 'manualEffort'];

  tsForm: FormGroup = this.fb.group({
    date: [this.calcService.TODAY, Validators.required],
    project: ['', Validators.required],
    module: [''],
    taskType: ['', Validators.required],
    priority: ['Medium'],
    status: ['Completed', Validators.required],
    tool: ['N/A', Validators.required],
    details: ['', Validators.required],
    planned: [4, [Validators.required, Validators.min(0.5)]],
    actual: [4, [Validators.required, Validators.min(0)]],
    aiHours: [0, Validators.min(0)],
    manualEffort: [4, Validators.min(0)],
    notes: ['']
  });

  ngOnInit(): void {
    this.dataService.loadTimesheetsFromBackend(this.emp().id);
    if (this.ui().editId) {
      this.loadEditEntry(this.ui().editId!);
    }
  }

  get editId(): string | null | undefined {
    return this.ui().editId;
  }

  get editEntry(): TimesheetEntry | undefined {
    return this.editId ? this.dataService.entries().find(x => x.id === this.editId) : undefined;
  }

  subStatus = computed(() => {
    return this.calcService.subStatus(this.emp().id, this.ui().month, this.dataService.entries());
  });

  allEntries = computed(() => {
    return this.dataService.entries().filter(x => x.empId === this.emp().id && x.month === this.ui().month);
  });

  aggAll = computed(() => {
    return this.calcService.agg(this.calcService.valid(this.allEntries()));
  });

  weeks = computed(() => {
    const mk = this.ui().month;
    const dates = this.calcService.workDays(mk).concat(this.allEntries().map(x => x.date));
    return Array.from(new Set(dates.map(d => this.calcService.weekStart(d)))).sort();
  });

  calcResult(): any {
    const val = this.tsForm.value;
    return this.calcService.calc({
      planned: val.planned,
      actual: val.actual,
      aiHours: val.aiHours,
      status: val.status
    } as any);
  }

  get isJustificationRequired(): boolean {
    const p = this.calcService.num(this.tsForm.value.planned);
    const a = this.calcService.num(this.tsForm.value.actual);
    return a > p && p > 0;
  }

  isValidHalfStep(val: any): boolean {
    if (val === '' || val === null || val === undefined) return false;
    const n = Number(val);
    if (isNaN(n) || n < 0) return false;
    const doubleVal = n * 2;
    return Math.abs(doubleVal - Math.round(doubleVal)) < 1e-5;
  }

  onHoursBlur(field: 'planned' | 'actual' | 'aiHours' | 'manualEffort'): void {
    const raw = this.tsForm.get(field)?.value;
    if (raw !== '' && raw !== null && raw !== undefined) {
      if (!this.isValidHalfStep(raw)) {
        // Automatically remove invalid values on blur as required
        this.tsForm.patchValue({ [field]: '' });
        const label = field === 'aiHours' ? 'AI Effort / AI Hours' : (field === 'manualEffort' ? 'Manual Effort' : field.charAt(0).toUpperCase() + field.slice(1) + ' Hours');
        this.notification.toast(`Invalid value removed: ${label} must be a whole number or multiple of 0.5 (e.g. 1, 1.5, 2).`);
      }
    }
  }

  onToolChange(): void {
    const tool = this.tsForm.get('tool')?.value;
    if (tool === 'N/A' || !tool) {
      const act = this.calcService.num(this.tsForm.get('actual')?.value);
      this.tsForm.patchValue({ aiHours: 0, manualEffort: act });
    }
  }

  onHoursChange(field: 'actual' | 'aiHours' | 'manualEffort'): void {
    this.editHistory = [field, ...this.editHistory.filter(f => f !== field)];
    const first = this.editHistory[0];
    const second = this.editHistory[1];

    const actualVal = this.calcService.num(this.tsForm.get('actual')?.value);
    const aiVal = this.calcService.num(this.tsForm.get('aiHours')?.value);
    const manualVal = this.calcService.num(this.tsForm.get('manualEffort')?.value);

    const roundHalf = (n: number) => Math.round(n * 2) / 2;
    const fields: ('actual' | 'aiHours' | 'manualEffort')[] = ['actual', 'aiHours', 'manualEffort'];
    const target = fields.find(f => f !== first && f !== second);

    if (target === 'actual') {
      const newActual = roundHalf(aiVal + manualVal);
      this.tsForm.patchValue({ actual: newActual }, { emitEvent: false });
    } else if (target === 'manualEffort') {
      const newManual = Math.max(0, roundHalf(actualVal - aiVal));
      this.tsForm.patchValue({ manualEffort: newManual }, { emitEvent: false });
    } else if (target === 'aiHours') {
      const newAi = Math.max(0, roundHalf(actualVal - manualVal));
      this.tsForm.patchValue({ aiHours: newAi }, { emitEvent: false });
    }
  }

  loadEditEntry(id: string): void {
    const e = this.dataService.entries().find(x => x.id === id);
    if (e) {
      const planned = this.calcService.num(e.planned);
      const actual = this.calcService.num(e.actual);
      const ai = this.calcService.num(e.aiHours);
      const manual = e.manual !== undefined ? this.calcService.num(e.manual) : Math.max(0, Number((actual - ai).toFixed(2)));

      this.tsForm.patchValue({
        date: e.date,
        project: e.project,
        module: e.module || '',
        taskType: e.taskType,
        priority: e.priority || 'Medium',
        status: e.status || 'Completed',
        tool: e.tool || 'N/A',
        details: e.details,
        planned,
        actual,
        aiHours: ai,
        manualEffort: manual,
        notes: e.notes || ''
      });
      this.editHistory = ['actual', 'aiHours'];
      this.formErrors = [];
    }
  }

  cancelEdit(): void {
    this.dataService.updateUI({ editId: null });
    this.tsForm.reset({
      date: this.calcService.TODAY,
      project: '',
      module: '',
      taskType: '',
      priority: 'Medium',
      status: 'Completed',
      tool: 'N/A',
      details: '',
      planned: 4,
      actual: 4,
      aiHours: 0,
      manualEffort: 4,
      notes: ''
    });
    this.editHistory = ['aiHours', 'manualEffort'];
    this.formErrors = [];
  }

  clearForm(): void {
    this.tsForm.patchValue({
      project: '',
      module: '',
      taskType: '',
      details: '',
      tool: 'N/A',
      planned: 4,
      actual: 4,
      aiHours: 0,
      manualEffort: 4,
      notes: ''
    });
    this.editHistory = ['aiHours', 'manualEffort'];
    this.formErrors = [];
  }

  validate(): boolean {
    this.formErrors = [];
    const v = this.tsForm.value;
    const isNum = (val: any) => val !== '' && val !== null && isFinite(parseFloat(val));

    if (!v.date) this.formErrors.push('Date is required.');
    else if (v.date > this.calcService.TODAY) this.formErrors.push('Date cannot be in the future.');

    if (!v.project) this.formErrors.push('Project is required.');
    if (!v.taskType) this.formErrors.push('Task type is required.');
    if (!v.details?.trim()) this.formErrors.push('Task details are required.');

    // 1a: Validate planned hours (whole numbers and multiples of 0.5 only)
    if (!isNum(v.planned) || this.calcService.num(v.planned) <= 0) {
      this.formErrors.push('Planned hours must be greater than 0.');
    } else if (!this.isValidHalfStep(v.planned)) {
      this.formErrors.push('Planned hours must be a whole number or multiple of 0.5 (e.g. 1, 1.5, 2).');
    }

    // 1a: Validate actual hours (whole numbers and multiples of 0.5 only)
    if (!isNum(v.actual) || this.calcService.num(v.actual) < 0) {
      this.formErrors.push('Actual hours must be 0 or more.');
    } else if (!this.isValidHalfStep(v.actual)) {
      this.formErrors.push('Actual hours must be a whole number or multiple of 0.5 (e.g. 1, 1.5, 2).');
    }

    // 1a: Validate AI hours (multiple of 0.5)
    if (isNum(v.aiHours) && !this.isValidHalfStep(v.aiHours)) {
      this.formErrors.push('AI Effort / AI Hours must be a whole number or multiple of 0.5 (e.g. 0.5, 1, 1.5).');
    }

    // 1a: Validate manual effort (multiple of 0.5)
    if (isNum(v.manualEffort) && !this.isValidHalfStep(v.manualEffort)) {
      this.formErrors.push('Manual Effort must be a whole number or multiple of 0.5 (e.g. 0.5, 1, 1.5).');
    }

    if (v.status === 'Completed' && this.calcService.num(v.actual) <= 0) {
      this.formErrors.push('Completed tasks need actual hours greater than 0.');
    }

    const aiH = this.calcService.num(v.aiHours);
    const actH = this.calcService.num(v.actual);
    if (aiH > actH) {
      this.formErrors.push('AI hours cannot exceed actual hours.');
    }

    // 1c: AI Tool Used and AI Effort validation
    const hasAiTool = v.tool && v.tool !== 'N/A' && v.tool !== NO_AI;
    if (hasAiTool && aiH <= 0) {
      this.formErrors.push(`AI Effort / AI Hours must be greater than 0 when an AI tool (${v.tool}) is selected.`);
    }
    if (!hasAiTool && aiH > 0) {
      this.formErrors.push('Select an AI Tool Used (cannot be N/A when AI hours are greater than 0).');
    }

    if (this.calcService.num(v.planned) > 24 || actH > 24) {
      this.formErrors.push('Hours for a single task cannot exceed 24.');
    }

    if (actH > this.calcService.num(v.planned) && this.calcService.num(v.planned) > 0 && !v.notes?.trim()) {
      this.formErrors.push('Add a justification note — actual hours exceed planned hours.');
    }

    return this.formErrors.length === 0;
  }

  save(mode: 'draft' | 'submit'): void {
    if (!this.validate()) return;

    if (mode === 'submit') {
      const isEdit = !!this.editId;
      const val = this.tsForm.value;
      const desc = val.details ? `"${val.details.length > 50 ? val.details.slice(0, 47) + '...' : val.details}"` : `task on ${val.project}`;
      const title = isEdit ? 'Update & Submit Timesheet Entry?' : 'Submit Timesheet Entry?';
      const message = isEdit
        ? `Are you sure you want to update and submit ${desc}? The record will be updated in the database with state "Submitted".`
        : `Are you sure you want to submit ${desc}? Once submitted, the record will be saved in the database with state "Submitted".`;
      const okLabel = isEdit ? 'Update & Submit' : 'Save & Submit';

      this.notification.confirm(title, message, okLabel).subscribe(confirmed => {
        if (confirmed) {
          this.executeSave(mode);
        }
      });
    } else {
      // Draft mode: no confirmation needed
      this.executeSave(mode);
    }
  }

  private executeSave(mode: 'draft' | 'submit'): void {
    const isEdit = !!this.editId;
    const rec = { ...this.tsForm.value };
    rec.manual = this.calcService.num(rec.manualEffort);
    this.dataService.saveEntry(rec, mode, this.editId);
    if (mode === 'submit') {
      this.notification.toast(isEdit ? 'Timesheet entry updated & submitted ✓' : 'Entry submitted ✓');
    } else {
      this.notification.toast(isEdit ? 'Timesheet entry updated as draft ✓' : 'Draft saved ✓');
    }
    this.cancelEdit();
  }

  selectWeek(w: string): void {
    this.selectedWeek = w;
  }

  getWeekAgg(w: string): any {
    const list = this.allEntries().filter(x => this.calcService.weekStart(x.date) === w);
    return this.calcService.agg(this.calcService.valid(list));
  }

  areAllDraftsSelected(): boolean {
    const drafts = this.filteredTableRows.filter(r => r.state === 'Draft');
    return drafts.length > 0 && drafts.every(r => this.selectedEntryIds.has(r.id));
  }

  toggleSelectAllDrafts(): void {
    const drafts = this.filteredTableRows.filter(r => r.state === 'Draft');
    if (this.areAllDraftsSelected()) {
      drafts.forEach(r => this.selectedEntryIds.delete(r.id));
    } else {
      drafts.forEach(r => this.selectedEntryIds.add(r.id));
    }
  }

  onSelectChange(event: { row: any; checked: boolean }): void {
    if (event.row.state !== 'Draft') return;
    if (event.checked) {
      this.selectedEntryIds.add(event.row.id);
    } else {
      this.selectedEntryIds.delete(event.row.id);
    }
  }

  onSelectAllChange(checked: boolean): void {
    const drafts = this.filteredTableRows.filter(r => r.state === 'Draft');
    if (checked) {
      drafts.forEach(r => this.selectedEntryIds.add(r.id));
    } else {
      drafts.forEach(r => this.selectedEntryIds.delete(r.id));
    }
  }

  onEditEntry(row: any): void {
    this.dataService.updateUI({ editId: row.id });
    this.loadEditEntry(row.id);
    setTimeout(() => {
      document.getElementById('tsForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  onDeleteEntry(row: any): void {
    const desc = row.details ? `"${row.details}"` : `task on ${row.project}`;
    this.notification.confirm(
      'Delete Timesheet Entry?',
      `Are you sure you want to delete ${desc} (${this.calcService.fDate(row.date)})? This action cannot be undone.`,
      'Delete'
    ).subscribe(confirmed => {
      if (confirmed) {
        this.selectedEntryIds.delete(row.id);
        this.dataService.deleteEntry(row.id);
        if (this.editId === row.id) {
          this.cancelEdit();
        }
        this.notification.toast('Timesheet entry deleted successfully ✓');
      }
    });
  }

  deleteSelectedRecords(): void {
    const count = this.selectedEntryIds.size;
    if (count === 0) return;
    this.notification.confirm(
      'Delete Selected Records?',
      `Are you sure you want to delete ${count === 1 ? 'this record' : 'these ' + count + ' records'}? This action cannot be undone.`,
      'Delete'
    ).subscribe(confirmed => {
      if (confirmed) {
        const ids = Array.from(this.selectedEntryIds);
        ids.forEach(id => {
          this.dataService.deleteEntry(id);
          if (this.editId === id) {
            this.cancelEdit();
          }
        });
        this.selectedEntryIds.clear();
        this.notification.toast(`Deleted ${count} record(s) successfully ✓`);
      }
    });
  }

  submitSelectedTimesheets(): void {
    const count = this.selectedEntryIds.size;
    if (count === 0) {
      this.notification.toast('Please select at least one draft timesheet entry to submit.');
      return;
    }
    this.notification.confirm(
      'Submit Selected Timesheets?',
      `Are you sure you want to submit ${count} selected draft timesheet entry(ies) to your manager?`,
      'Submit'
    ).subscribe(confirmed => {
      if (confirmed) {
        const ids = Array.from(this.selectedEntryIds);
        const submittedCount = this.dataService.submitSelected(ids);
        this.selectedEntryIds.clear();
        this.notification.toast(`Submitted ${submittedCount} timesheet entry(ies) successfully ✓`);
      }
    });
  }

  get filteredTableRows(): any[] {
    const list = this.allEntries().filter(x => this.selectedWeek === 'all' || this.calcService.weekStart(x.date) === this.selectedWeek);
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  get tableCols(): ColumnDef[] {
    return [
      { k: '_select', l: 'Select', noExport: true },
      { k: 'date', l: 'Date', f: (v) => this.calcService.fDate(v) },
      { k: 'month', l: 'Month', v: (r) => this.calcService.mLabel(r.month) },
      { k: 'project', l: 'Project' },
      { k: 'module', l: 'Module / Page' },
      { k: 'taskType', l: 'Task Type' },
      { k: 'details', l: 'Task Details', wrap: true },
      { k: 'priority', l: 'Priority' },
      { k: 'planned', l: 'Planned', n: true },
      { k: 'actual', l: 'Actual', n: true },
      { k: 'aiHours', l: 'AI Hrs', n: true },
      { k: 'manual', l: 'Manual', n: true, v: (r) => this.calcService.calc(r).manual },
      { k: 'saved', l: 'Saved', n: true, v: (r) => this.calcService.calc(r).saved, f: (v) => `<span class="${v > 0 ? 'up' : (v < 0 ? 'down' : '')}">${this.calcService.fh(v)}</span>` },
      { k: 'savingsPct', l: 'Savings %', n: true, pct: true, v: (r) => this.calcService.calc(r).savingsPct },
      { k: 'tool', l: 'AI Tool' },
      { k: 'status', l: 'Status', f: (v) => `<span class="badge ${v === 'Completed' ? 'ok' : 'warn'}">${v}</span>` },
      { k: 'state', l: 'State', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : 'mute'}">${v}</span>` },
      { k: 'notes', l: 'Notes', wrap: true },
      { k: '_actions', l: 'Actions', noExport: true }
    ];
  }
}
