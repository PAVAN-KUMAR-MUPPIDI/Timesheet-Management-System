import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
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
  selector: 'app-manager-team-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, BaseChartDirective, FilterBarComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Team Dashboard</h2>
        <p>Real-time view of team productivity · {{ calcService.mLong(ui().month) }} ({{ ui().month }}) · submitted timesheets only</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <app-filter-bar></app-filter-bar>

    <!-- 8 Team KPI Cards -->
    <div class="kpis">
      <app-kpi-card label="Employees" [value]="scopedEmployees().length" [subtext]="'🟢 ' + countStatus('Submitted') + ' · 🟡 ' + countStatus('Partially Submitted') + ' · 🔴 ' + countStatus('Not Submitted')"></app-kpi-card>
      <app-kpi-card label="Total Tasks" [value]="agg().tasks" [subtext]="agg().completed + ' completed'" tone="#8b5cf6"></app-kpi-card>
      <app-kpi-card label="Planned vs Actual" [value]="calcService.fh(agg().planned) + ' / ' + calcService.fh(agg().actual)" [subtext]="varianceTxt()" tone="#0ea5e9" [small]="true"></app-kpi-card>
      <app-kpi-card label="AI Hours" [value]="calcService.fh(agg().ai)" [subtext]="calcService.fp(calcService.safePct(agg().ai, agg().actual)) + ' of actual'" tone="#14b8a6"></app-kpi-card>
      <app-kpi-card label="Effort Saved via AI" [value]="calcService.fh(agg().aiSaved) + ' h'" [subtext]="'Total saved ' + calcService.fh(agg().saved) + ' h'" tone="#10b981"></app-kpi-card>
      <app-kpi-card label="Efficiency %" [value]="calcService.fp(agg().efficiency)" [subtext]="'Avg savings ' + calcService.fp(agg().avgSavings)" tone="#f59e0b"></app-kpi-card>
      <app-kpi-card label="Task Completion" [value]="calcService.fp(agg().completionRate)" [subtext]="agg().completed + ' / ' + agg().tasks" tone="#8b5cf6"></app-kpi-card>
      <app-kpi-card label="AI Tool Adoption" [value]="calcService.fp(agg().adoption)" [subtext]="aiUserCount() + ' of ' + scopedEmployees().length + ' employees use AI'" tone="#ec4899"></app-kpi-card>
    </div>

    <!-- Submission Alert Banner -->
    <div class="banner" [class.bad]="hasNotSubmitted()" [class.warn]="!hasNotSubmitted() && notSubmittedRows().length > 0" [class.ok]="notSubmittedRows().length === 0">
      <div style="font-size:20px">{{ notSubmittedRows().length > 0 ? (hasNotSubmitted() ? '🔴' : '🟡') : '🟢' }}</div>
      <div *ngIf="notSubmittedRows().length > 0">
        <div class="t">{{ notSubmittedRows().length }} employee(s) have not fully submitted for {{ calcService.mLong(ui().month) }} ({{ ui().month }})</div>
        <div class="d">
          <span *ngFor="let r of notSubmittedRows(); let last = last">
            {{ r.status === 'Not Submitted' ? '🔴' : '🟡' }} {{ r.name }} ({{ r.covered }}/{{ r.wd }} days)<span *ngIf="!last"> &nbsp;·&nbsp; </span>
          </span>
        </div>
      </div>
      <div *ngIf="notSubmittedRows().length === 0" class="t">All employees in scope have submitted their timesheets for {{ calcService.mLong(ui().month) }} ({{ ui().month }}).</div>
      <div class="sp"></div>
      <button class="btn sm ghost" routerLink="/manager/timesheet-status">View status</button>
    </div>

    <!-- Charts -->
    <div class="grid g2">
      <app-chart-card title="Planned vs Actual Hours by Employee" sub="Submitted entries">
        <canvas baseChart [data]="paChartData" [options]="paChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="Productivity Trend" sub="Month-wise efficiency & hours saved">
        <canvas baseChart [data]="trendChartData" [options]="trendChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
    </div>

    <div class="grid g2">
      <app-chart-card title="AI Tool Usage" sub="Tasks per tool">
        <canvas baseChart [data]="toolChartData" [options]="toolChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="Team-wise Efficiency" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="teamChartData" [options]="teamChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
    </div>

    <!-- Employee-wise Productivity Table -->
    <div class="card">
      <app-data-table title="Employee-wise Productivity" [cols]="tableCols" [rows]="employeeRows()" [rowClass]="getRowClass"></app-data-table>
    </div>
  `
})
export class TeamDashboardComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);
  router = inject(Router);

  ui = this.dataService.ui;

  scopedEmployees = computed(() => {
    const t = this.ui().mTeam;
    const e = this.ui().mEmp;
    return this.dataService.employees().filter(x => (t === 'all' || x.team === t) && (e === 'all' || x.id === e));
  });

  validSubmittedEntries = computed(() => {
    const set = new Set(this.scopedEmployees().map(e => e.id));
    const monthEntries = this.dataService.entries().filter(e => (e.month === this.ui().month || (e.date && e.date.startsWith(this.ui().month))));
    const validMonth = this.calcService.valid(monthEntries);
    return validMonth.filter(e => set.has(e.empId) && e.state === 'Submitted');
  });

  agg = computed(() => {
    return this.calcService.agg(this.validSubmittedEntries());
  });

  statusRows = computed(() => {
    return this.scopedEmployees().map(e => this.calcService.subStatus(e.id, this.ui().month, this.dataService.entries()));
  });

  countStatus(statusStr: string): number {
    return this.statusRows().filter(s => s.status === statusStr).length;
  }

  aiUserCount(): number {
    return new Set(this.validSubmittedEntries().filter(e => this.calcService.isAI(e)).map(e => e.empId)).size;
  }

  notSubmittedRows = computed(() => {
    return this.scopedEmployees()
      .map(e => ({ name: e.name, ...this.calcService.subStatus(e.id, this.ui().period, this.dataService.entries()) }))
      .filter(r => r.status !== 'Submitted');
  });

  hasNotSubmitted(): boolean {
    return this.notSubmittedRows().some(r => r.status === 'Not Submitted');
  }

  varianceTxt(): string {
    const v = this.agg().variance;
    const cls = v > 0 ? 'down' : (v < 0 ? 'up' : '');
    return `<span class="${cls}">${v > 0 ? '+' : ''}${this.calcService.fh(v)}h vs plan</span>`;
  }

  getRowClass(r: any): string {
    if (r.status === 'Not Submitted') return 'row-alert';
    if (r.status === 'Partially Submitted') return 'row-warn';
    return '';
  }

  employeeRows = computed(() => {
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
        completion: a.completionRate,
        adoption: a.adoption,
        topTool: a.topTool
      };
    });
  });

  // Planned vs Actual Grouped Bar Chart
  get paChartData(): ChartConfiguration<'bar'>['data'] {
    const er = this.employeeRows();
    return {
      labels: er.map(r => r.name.split(' ')[0]),
      datasets: [
        { label: 'Planned', data: er.map(r => r.planned), backgroundColor: '#94a3b8', borderRadius: 5 },
        { label: 'Actual', data: er.map(r => r.actual), backgroundColor: '#3b6fe0', borderRadius: 5 },
        { label: 'AI Hours', data: er.map(r => r.ai), backgroundColor: '#14b8a6', borderRadius: 5 }
      ]
    };
  }

  readonly paChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#eef1f6' }, title: { display: true, text: 'Hours' } } }
  };

  // Team Trend Chart
  get trendChartData(): any {
    const emps = this.scopedEmployees();
    const set = new Set(emps.map(e => e.id));
    const months = this.dataService.availableMonths();

    const rows = months.map(m => {
      const list = this.dataService.entries().filter(e => set.has(e.empId) && e.month === m && e.state === 'Submitted');
      return { label: this.calcService.mLabel(m), ...this.calcService.agg(this.calcService.valid(list)) };
    });

    return {
      labels: rows.map(r => r.label),
      datasets: [
        { label: 'Hours Saved', data: rows.map(r => r.saved), backgroundColor: '#10b981', borderRadius: 5 },
        { type: 'line', label: 'Efficiency %', data: rows.map(r => r.efficiency), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.3, yAxisID: 'y1', borderWidth: 2.5, pointRadius: 3 },
        { type: 'line', label: 'AI Adoption %', data: rows.map(r => r.adoption), borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', tension: 0.3, yAxisID: 'y1', borderWidth: 2.5, pointRadius: 3 }
      ]
    };
  }

  readonly trendChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: '#eef1f6' }, title: { display: true, text: 'Hours' } },
      y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' }, title: { display: true, text: '%' } }
    }
  };

  // Tool Bar Chart
  get toolChartData(): ChartConfiguration<'bar'>['data'] {
    const a = this.agg();
    const tc = Object.entries(a.toolCounts).sort((x, y) => Number(y[1]) - Number(x[1]));
    return {
      labels: tc.map(x => x[0]),
      datasets: [{ label: 'Tasks', data: tc.map(x => Number(x[1])), backgroundColor: '#14b8a6', borderRadius: 5 }]
    };
  }

  readonly toolChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  // Team-wise Efficiency Chart
  get teamChartData(): ChartConfiguration<'bar'>['data'] {
    const m = this.ui().month;
    const monthEntries = this.dataService.entries().filter(e => (e.month === m || (e.date && e.date.startsWith(m))));
    const tm = this.dataService.teams().filter(t => this.ui().mTeam === 'all' || t === this.ui().mTeam).map(t => {
      const emps = this.dataService.employees().filter(e => e.team === t);
      const set = new Set(emps.map(e => e.id));
      const list = monthEntries.filter(e => set.has(e.empId) && e.state === 'Submitted');
      return { team: t, ...this.calcService.agg(this.calcService.valid(list)) };
    });

    return {
      labels: tm.map(t => t.team),
      datasets: [
        { label: 'Efficiency %', data: tm.map(t => t.efficiency), backgroundColor: '#f59e0b', borderRadius: 5 },
        { label: 'Completion %', data: tm.map(t => t.completionRate), backgroundColor: '#8b5cf6', borderRadius: 5 },
        { label: 'AI Adoption %', data: tm.map(t => t.adoption), backgroundColor: '#14b8a6', borderRadius: 5 }
      ]
    };
  }

  readonly teamChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
  };

  get tableCols(): ColumnDef[] {
    return [
      {
        k: 'name', l: 'Employee',
        f: (v, r) => `<a href="#" onclick="window.angularComponent.pickEmp('${r.id}'); return false;" style="color:var(--brand);font-weight:600;text-decoration:none">${v}</a>`
      },
      { k: 'team', l: 'Team' },
      { k: 'status', l: 'Timesheet', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : (v === 'Partially Submitted' ? 'warn' : 'bad')}">${v}</span>` },
      { k: 'tasks', l: 'Tasks', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'ai', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true },
      { k: 'completion', l: 'Completion %', n: true, pct: true },
      { k: 'adoption', l: 'AI Adoption %', n: true, pct: true },
      { k: 'topTool', l: 'Top AI Tool' }
    ];
  }

  constructor() {
    (window as any).angularComponent = {
      pickEmp: (id: string) => {
        this.dataService.updateUI({ mEmp: id, mTeam: 'all' });
        this.router.navigate(['/manager/employee-productivity']);
      }
    };
  }
}
