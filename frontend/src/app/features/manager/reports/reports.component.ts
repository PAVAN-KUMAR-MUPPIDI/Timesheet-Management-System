import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { ExportService, ColumnDef } from '../../../core/services/export.service';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'app-manager-reports',
  standalone: true,
  imports: [CommonModule, FilterBarComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Reports</h2>
        <p>Export and review team, period and data-quality reports · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <app-filter-bar></app-filter-bar>

    <!-- 6 Instant Report Cards Grid -->
    <div class="report-cards">
      <div class="card rc" *ngFor="let key of reportKeys">
        <h4>{{ reports[key].t }}</h4>
        <p>{{ reports[key].d }}</p>
        <div class="row">
          <button class="btn sm" (click)="exportReport(key, 'xlsx')">⭳ Excel</button>
          <button class="btn sm ghost" (click)="exportReport(key, 'csv')">⭳ CSV</button>
        </div>
      </div>
    </div>

    <!-- Team-wise Productivity Table -->
    <div class="card" style="margin-bottom:16px">
      <app-data-table title="Team-wise Productivity" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'" [cols]="teamCols" [rows]="teamRows()" [noSearch]="true"></app-data-table>
    </div>

    <!-- Month-wise Trend Table -->
    <div class="card" style="margin-bottom:16px">
      <app-data-table title="Month-wise Productivity" sub="Current scope · submitted entries" [cols]="monthCols" [rows]="monthRows()" [noSearch]="true"></app-data-table>
    </div>

    <!-- Data Quality - Excluded Entries Table -->
    <div class="card">
      <app-data-table title="Data Quality — Excluded Entries" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'" [cols]="excludedCols" [rows]="excludedRows()" emptyMsg="No duplicate or incomplete entries 🎉"></app-data-table>
      <div class="note">
        Duplicate = same employee, date, project, module, task type and details as an earlier entry. Incomplete = missing a required field or planned hours of 0. These entries never count toward any metric.
      </div>
    </div>
  `
})
export class ReportsComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);
  exportService = inject(ExportService);

  ui = this.dataService.ui;
  reportKeys = ['entries', 'emp', 'tools', 'status', 'team', 'month'];

  scopedEmployees = computed(() => {
    const t = this.ui().mTeam;
    const e = this.ui().mEmp;
    return this.dataService.employees().filter(x => (t === 'all' || x.team === t) && (e === 'all' || x.id === e));
  });

  teamRows = computed(() => {
    const m = this.ui().month;
    const monthEntries = this.dataService.entries().filter(e => (e.month === m || (e.date && e.date.startsWith(m))));
    return this.dataService.teams().filter((t: string) => this.ui().mTeam === 'all' || t === this.ui().mTeam).map((t: string) => {
      const emps = this.dataService.employees().filter(e => e.team === t);
      const set = new Set(emps.map(e => e.id));
      const list = monthEntries.filter(e => set.has(e.empId) && e.state === 'Submitted');
      const a = this.calcService.agg(this.calcService.valid(list));
      const sts = emps.map(e => this.calcService.subStatus(e.id, m, this.dataService.entries()).status);

      return {
        team: t,
        members: emps.length,
        submitted: sts.filter(s => s === 'Submitted').length,
        partial: sts.filter(s => s === 'Partially Submitted').length,
        notSub: sts.filter(s => s === 'Not Submitted').length,
        tasks: a.tasks,
        planned: a.planned,
        actual: a.actual,
        ai: a.ai,
        saved: a.saved,
        eff: a.efficiency,
        completion: a.completionRate,
        adoption: a.adoption,
        topTool: a.topTool
      };
    });
  });

  monthRows = computed(() => {
    const set = new Set(this.scopedEmployees().map(e => e.id));
    return this.dataService.availableMonths().slice().reverse().map(m => {
      const list = this.dataService.entries().filter(e => set.has(e.empId) && e.month === m && e.state === 'Submitted');
      const a = this.calcService.agg(this.calcService.valid(list));
      return {
        month: m,
        label: this.calcService.mLabel(m),
        tasks: a.tasks,
        planned: a.planned,
        actual: a.actual,
        ai: a.ai,
        saved: a.saved,
        eff: a.efficiency,
        avgSav: a.avgSavings,
        completion: a.completionRate,
        adoption: a.adoption,
        aiTasks: a.aiTasks,
        topTool: a.topTool
      };
    });
  });

  excludedRows = computed(() => {
    const set = new Set(this.scopedEmployees().map(e => e.id));
    const m = this.ui().month;
    const all = this.calcService.annotate(this.dataService.entries());
    const monthAll = all.filter(e => (e.month === m || (e.date && e.date.startsWith(m))));
    const excl = monthAll.filter(e => (e._dup || e._inc) && set.has(e.empId));
    const empMap = new Map(this.dataService.employees().map(e => [e.id, e.name]));

    return excl.map(e => ({
      ...e,
      empName: empMap.get(e.empId) || e.empId,
      flag: e._dup ? 'Duplicate' : 'Incomplete'
    }));
  });

  get teamCols(): ColumnDef[] {
    return [
      { k: 'team', l: 'Team' },
      { k: 'members', l: 'Members', n: true },
      { k: 'submitted', l: '🟢 Submitted', n: true },
      { k: 'partial', l: '🟡 Partial', n: true },
      { k: 'notSub', l: '🔴 Not Submitted', n: true },
      { k: 'tasks', l: 'Tasks', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'ai', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true },
      { k: 'completion', l: 'Completion %', n: true, pct: true },
      { k: 'adoption', l: 'AI Adoption %', n: true, pct: true },
      { k: 'topTool', l: 'Top Tool' }
    ];
  }

  get monthCols(): ColumnDef[] {
    return [
      { k: 'label', l: 'Month' },
      { k: 'tasks', l: 'Tasks', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'ai', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true },
      { k: 'avgSav', l: 'Avg Savings %', n: true, pct: true },
      { k: 'completion', l: 'Completion %', n: true, pct: true },
      { k: 'adoption', l: 'AI Adoption %', n: true, pct: true },
      { k: 'topTool', l: 'Top Tool' }
    ];
  }

  get excludedCols(): ColumnDef[] {
    return [
      { k: 'empName', l: 'Employee' },
      { k: 'date', l: 'Date', f: (v) => this.calcService.fDate(v) },
      { k: 'project', l: 'Project' },
      { k: 'taskType', l: 'Task Type' },
      { k: 'details', l: 'Details', wrap: true },
      { k: 'planned', l: 'Planned', n: true },
      { k: 'actual', l: 'Actual', n: true },
      { k: 'flag', l: 'Reason', f: (v) => `<span class="badge bad">${v}</span>` }
    ];
  }

  get reports(): { [key: string]: { t: string; d: string } } {
    return {
      entries: { t: 'Timesheet Entries', d: 'All submitted entries in scope for the selected month, with calculated fields.' },
      emp: { t: 'Employee Productivity Summary', d: 'Employee-wise totals, efficiency, completion and adoption.' },
      tools: { t: 'AI Tools Analysis', d: 'Tool-level task counts per employee, hours and efficiency.' },
      status: { t: 'Timesheet Submission Status', d: 'Submitted / partial / not submitted with coverage per employee.' },
      team: { t: 'Team-wise Summary', d: 'Productivity rolled up by team for the selected month.' },
      month: { t: 'Month-wise Trend', d: 'Monthly totals and efficiency across all months for the current scope.' }
    };
  }

  exportReport(key: string, fmt: 'xlsx' | 'csv'): void {
    const m = this.ui().month;
    const emps = this.scopedEmployees();
    const set = new Set(emps.map(e => e.id));
    const periodTag = m.replace(/\s+/g, '_');

    if (key === 'entries') {
      const monthEntries = this.dataService.entries().filter(e => (e.month === m || (e.date && e.date.startsWith(m))));
      const list = this.calcService.valid(monthEntries).filter(e => set.has(e.empId) && e.state === 'Submitted');
      const empMap = new Map(this.dataService.employees().map(e => [e.id, e]));
      const rows = list.map(e => {
        const c = this.calcService.calc(e);
        const emp = empMap.get(e.empId);
        return { ...e, empName: emp?.name, team: emp?.team, manual: c.manual, saved: c.saved, savingsPct: c.savingsPct, flag: e.state };
      });
      this.exportService.exportData('Timesheet_Entries_' + periodTag, this.excludedCols, rows, fmt);
    } else if (key === 'team') {
      this.exportService.exportData('Team_Summary_' + periodTag, this.teamCols, this.teamRows(), fmt);
    } else if (key === 'month') {
      this.exportService.exportData('Month_Trend_' + periodTag, this.monthCols, this.monthRows(), fmt);
    } else {
      this.exportService.exportData(this.reports[key].t + '_' + periodTag, this.teamCols, this.teamRows(), fmt);
    }
  }
}
