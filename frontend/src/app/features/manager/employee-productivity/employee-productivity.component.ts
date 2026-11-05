import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-manager-employee-productivity',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, FilterBarComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Employee Productivity</h2>
        <p>Compare employees and drill into individual timesheets · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <app-filter-bar></app-filter-bar>

    <!-- Spotlight Employee Header (Rendered when specific employee is selected) -->
    <div class="card" style="margin-bottom:16px" *ngIf="selectedEmp()">
      <div class="card-h">
        <div class="avatar" style="background:var(--brand); width:36px; height:36px; font-weight:700;">
          {{ calcService.initials(selectedEmp()!.name) }}
        </div>
        <div>
          <h3>{{ selectedEmp()!.name }}</h3>
          <div class="sub">{{ selectedEmp()!.designation }} · {{ selectedEmp()!.team }}</div>
        </div>
        <div class="sp"></div>
        <span class="badge" [class.ok]="spotlightSub().status === 'Submitted'" [class.warn]="spotlightSub().status === 'Partially Submitted'" [class.bad]="spotlightSub().status === 'Not Submitted'">
          {{ spotlightSub().status }}
        </span>
        <span class="sub">{{ spotlightSub().covered }}/{{ spotlightSub().wd }} days</span>
        <button class="btn sm ghost" (click)="clearSelectedEmp()">✕ Show all</button>
      </div>

      <!-- 9 KPI Grid for Spotlight Employee -->
      <div class="kpis">
        <app-kpi-card label="Total Tasks" [value]="spotlightAgg().tasks" [subtext]="spotlightAgg().completed + ' completed'"></app-kpi-card>
        <app-kpi-card label="Total Planned Hours" [value]="calcService.fh(spotlightAgg().planned)" subtext="Estimated effort" tone="#94a3b8"></app-kpi-card>
        <app-kpi-card label="Total Actual Hours" [value]="calcService.fh(spotlightAgg().actual)" [subtext]="spotlightVarianceTxt()" tone="#3b6fe0"></app-kpi-card>
        <app-kpi-card label="Total AI Hours" [value]="calcService.fh(spotlightAgg().ai)" [subtext]="calcService.fp(calcService.safePct(spotlightAgg().ai, spotlightAgg().actual)) + ' of actual'" tone="#14b8a6"></app-kpi-card>
        <app-kpi-card label="Average Savings %" [value]="calcService.fp(spotlightAgg().avgSavings)" subtext="Per completed task" tone="#f59e0b"></app-kpi-card>
        <app-kpi-card label="Total Effort Saved" [value]="calcService.fh(spotlightAgg().saved) + ' h'" [subtext]="'Efficiency ' + calcService.fp(spotlightAgg().efficiency)" tone="#10b981"></app-kpi-card>
        <app-kpi-card label="Task Completion Rate" [value]="calcService.fp(spotlightAgg().completionRate)" [subtext]="spotlightAgg().completed + ' / ' + spotlightAgg().tasks + ' tasks'" tone="#8b5cf6"></app-kpi-card>
        <app-kpi-card label="Most Used AI Tool" [value]="spotlightAgg().topTool" [subtext]="spotlightAgg().topCount ? spotlightAgg().topCount + ' tasks' : '—'" tone="#ec4899" [small]="true"></app-kpi-card>
        <app-kpi-card label="Planned vs Actual" [value]="calcService.fh(spotlightAgg().planned) + ' / ' + calcService.fh(spotlightAgg().actual)" [subtext]="spotlightAgg().planned ? calcService.fp(calcService.safePct(spotlightAgg().actual, spotlightAgg().planned)) + ' of plan used' : '0%'" tone="#0ea5e9" [small]="true"></app-kpi-card>
      </div>

      <div class="grid g2" style="margin-bottom:0">
        <app-chart-card title="Productivity Trend" sub="Monthly · submitted">
          <canvas baseChart [data]="spotlightTrendData" [options]="spotlightTrendOptions" [type]="'bar'"></canvas>
        </app-chart-card>
        <app-chart-card title="AI Tool Usage" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
          <canvas baseChart [data]="spotlightToolData" [options]="doughnutOptions" [type]="'doughnut'"></canvas>
        </app-chart-card>
      </div>
    </div>

    <!-- Spotlight Submitted Timesheet Table -->
    <div class="card" style="margin-bottom:16px" *ngIf="selectedEmp()">
      <app-data-table [title]="'Submitted Timesheet — ' + selectedEmp()!.name" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'" [pageSize]="12" [cols]="timesheetCols" [rows]="spotlightTimesheetRows()" emptyMsg="No submitted entries for this period"></app-data-table>
    </div>

    <div class="banner warn" style="background:var(--brandbg); border-color:#c9d8fb" *ngIf="!selectedEmp()">
      <div style="font-size:18px">👤</div>
      <div class="d">Select an employee in the filter above (or click a name in the table) to see their individual dashboard and submitted timesheets.</div>
    </div>

    <!-- Overview Charts -->
    <div class="grid g2">
      <app-chart-card title="Efficiency % by Employee" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="effChartData" [options]="effChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="Task Completion & AI Adoption" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="compChartData" [options]="compChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
    </div>

    <!-- Employee Comparison Table -->
    <div class="card">
      <app-data-table title="Employee Comparison" [cols]="cmpCols" [rows]="comparisonRows()" [rowClass]="getRowClass"></app-data-table>
    </div>
  `
})
export class EmployeeProductivityComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;

  selectedEmp = computed(() => {
    const id = this.ui().mEmp;
    return id !== 'all' ? this.dataService.employees().find(e => e.id === id) : null;
  });

  clearSelectedEmp(): void {
    this.dataService.updateUI({ mEmp: 'all' });
  }

  scopedEmployees = computed(() => {
    const t = this.ui().mTeam;
    return this.dataService.employees().filter(e => t === 'all' || e.team === t);
  });

  spotlightEntries = computed(() => {
    const emp = this.selectedEmp();
    if (!emp) return [];
    const monthEntries = this.dataService.entries().filter(e => (e.month === this.ui().month || (e.date && e.date.startsWith(this.ui().month))));
    return monthEntries.filter(e => e.empId === emp.id && e.state === 'Submitted');
  });

  spotlightAgg = computed(() => {
    return this.calcService.agg(this.calcService.valid(this.spotlightEntries()));
  });

  spotlightSub = computed(() => {
    const emp = this.selectedEmp();
    if (!emp) return { status: 'Not Submitted', covered: 0, wd: 20 };
    return this.calcService.subStatus(emp.id, this.ui().month, this.dataService.entries());
  });

  spotlightVarianceTxt(): string {
    const v = this.spotlightAgg().variance;
    const cls = v > 0 ? 'down' : (v < 0 ? 'up' : '');
    return `<span class="${cls}">${v > 0 ? '+' : ''}${this.calcService.fh(v)}h vs plan</span>`;
  }

  // Spotlight Trend Chart
  get spotlightTrendData(): any {
    const emp = this.selectedEmp();
    if (!emp) return { labels: [], datasets: [] };
    const months = this.dataService.availableMonths();
    const rows = months.map(m => {
      const list = this.dataService.entries().filter(e => e.empId === emp.id && e.month === m && e.state === 'Submitted');
      return { label: this.calcService.mLabel(m), ...this.calcService.agg(this.calcService.valid(list)) };
    });

    return {
      labels: rows.map(r => r.label),
      datasets: [
        { label: 'Planned', data: rows.map(r => r.planned), backgroundColor: '#94a3b8', borderRadius: 5 },
        { label: 'Actual', data: rows.map(r => r.actual), backgroundColor: '#3b6fe0', borderRadius: 5 },
        { type: 'line', label: 'Efficiency %', data: rows.map(r => r.efficiency), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.3, yAxisID: 'y1', borderWidth: 2.5, pointRadius: 3 }
      ]
    };
  }

  readonly spotlightTrendOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: '#eef1f6' } },
      y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } }
    }
  };

  // Spotlight Tool Doughnut Chart
  get spotlightToolData(): ChartConfiguration<'doughnut'>['data'] {
    const tc = Object.entries(this.spotlightAgg().toolCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
    return {
      labels: tc.map(x => x[0]),
      datasets: [{
        data: tc.map(x => Number(x[1])),
        backgroundColor: ['#3b6fe0','#14b8a6','#f59e0b','#8b5cf6','#ef4444','#10b981','#ec4899','#0ea5e9','#84cc16','#f97316'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    };
  }

  readonly doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    cutout: '62%',
    plugins: { legend: { position: 'right' } }
  };

  spotlightTimesheetRows = computed(() => {
    return [...this.calcService.valid(this.spotlightEntries())].sort((a, b) => b.date.localeCompare(a.date));
  });

  comparisonRows = computed(() => {
    const m = this.ui().month;
    const monthEntries = this.dataService.entries().filter(e => (e.month === m || (e.date && e.date.startsWith(m))));
    return this.scopedEmployees().map(e => {
      const list = monthEntries.filter(x => x.empId === e.id && x.state === 'Submitted');
      const a = this.calcService.agg(this.calcService.valid(list));
      const s = this.calcService.subStatus(e.id, m, this.dataService.entries());
      return {
        id: e.id,
        name: e.name,
        team: e.team,
        status: s.status,
        tasks: a.tasks,
        planned: a.planned,
        actual: a.actual,
        ai: a.ai,
        saved: a.saved,
        eff: a.efficiency,
        avgSav: a.avgSavings,
        completion: a.completionRate,
        adoption: a.adoption,
        topTool: a.topTool
      };
    });
  });

  getRowClass(r: any): string {
    if (r.status === 'Not Submitted') return 'row-alert';
    if (r.status === 'Partially Submitted') return 'row-warn';
    return '';
  }

  // Efficiency Chart
  get effChartData(): ChartConfiguration<'bar'>['data'] {
    const sorted = [...this.comparisonRows()].sort((a, b) => b.eff - a.eff);
    const selId = this.ui().mEmp;
    return {
      labels: sorted.map(r => r.name),
      datasets: [{
        label: 'Efficiency %',
        data: sorted.map(r => r.eff),
        backgroundColor: sorted.map(r => r.id === selId ? '#d97706' : '#f59e0b'),
        borderRadius: 5
      }]
    };
  }

  readonly effChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }
  };

  // Task Completion & AI Adoption Chart
  get compChartData(): ChartConfiguration<'bar'>['data'] {
    const er = this.comparisonRows();
    return {
      labels: er.map(r => r.name.split(' ')[0]),
      datasets: [
        { label: 'Completion %', data: er.map(r => r.completion), backgroundColor: '#8b5cf6', borderRadius: 5 },
        { label: 'AI Adoption %', data: er.map(r => r.adoption), backgroundColor: '#14b8a6', borderRadius: 5 }
      ]
    };
  }

  readonly compChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
  };

  get timesheetCols(): ColumnDef[] {
    return [
      { k: 'date', l: 'Date', f: (v) => this.calcService.fDate(v) },
      { k: 'project', l: 'Project' },
      { k: 'module', l: 'Module / Page' },
      { k: 'taskType', l: 'Task Type' },
      { k: 'details', l: 'Task Details', wrap: true },
      { k: 'planned', l: 'Planned', n: true },
      { k: 'actual', l: 'Actual', n: true },
      { k: 'aiHours', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Saved', n: true, v: (r) => this.calcService.calc(r).saved, f: (v) => `<span class="${v > 0 ? 'up' : (v < 0 ? 'down' : '')}">${this.calcService.fh(v)}</span>` },
      { k: 'tool', l: 'AI Tool' },
      { k: 'status', l: 'Status', f: (v) => `<span class="badge ${v === 'Completed' ? 'ok' : 'warn'}">${v}</span>` }
    ];
  }

  get cmpCols(): ColumnDef[] {
    return [
      {
        k: 'name', l: 'Employee',
        f: (v, r) => `<a href="#" onclick="window.angularComponent.selectEmp('${r.id}'); return false;" style="color:var(--brand);font-weight:600;text-decoration:none">${v}</a>`
      },
      { k: 'team', l: 'Team' },
      { k: 'status', l: 'Timesheet', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : (v === 'Partially Submitted' ? 'warn' : 'bad')}">${v}</span>` },
      { k: 'tasks', l: 'Tasks', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'ai', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true },
      { k: 'avgSav', l: 'Avg Savings %', n: true, pct: true },
      { k: 'completion', l: 'Completion %', n: true, pct: true },
      { k: 'adoption', l: 'AI Adoption %', n: true, pct: true },
      { k: 'topTool', l: 'Top AI Tool' }
    ];
  }

  constructor() {
    (window as any).angularComponent = {
      selectEmp: (id: string) => {
        this.dataService.updateUI({ mEmp: id });
      }
    };
  }
}
