import { Component, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Welcome back, {{ emp().name.split(' ')[0] }}</h2>
        <p>{{ emp().designation }} · {{ emp().team }} · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
      <div class="sp"></div>
      <label class="ctl" style="margin-right:12px;">
        Month
        <select [ngModel]="ui().month" (ngModelChange)="onMonthChange($event)">
          <option *ngFor="let m of availableMonths()" [value]="m">{{ calcService.mLong(m) }} ({{ m }})</option>
        </select>
      </label>
      <button class="btn" routerLink="/employee/timesheet">+ Add timesheet entry</button>
    </div>

    <!-- Timesheet Status Banner -->
    <div class="banner" [class]="statusUi().cls">
      <div style="font-size:22px">{{ statusUi().icon }}</div>
      <div>
        <div class="t">Timesheet: {{ subStatus().status }}</div>
        <div class="d">
          {{ subMsg() }}
          <span *ngIf="subStatus().drafts"> · {{ subStatus().drafts }} draft entry(ies) pending submission</span>
        </div>
      </div>
      <div class="sp"></div>
      <div style="min-width:180px">
        <div class="prog"><i [style.width.%]="subStatus().coverage" [style.background]="subStatus().coverage >= 100 ? '#22c55e' : (subStatus().coverage > 0 ? '#facc15' : '#ef4444')"></i></div>
      </div>
      <button class="btn sm ghost" routerLink="/employee/timesheet">Open timesheet</button>
    </div>

    <!-- 9 KPI Summary Grid -->
    <div class="kpis">
      <app-kpi-card label="Total Tasks" [value]="agg().tasks" [subtext]="agg().completed + ' completed'"></app-kpi-card>
      <app-kpi-card label="Total Planned Hours" [value]="calcService.fh(agg().planned)" subtext="Estimated effort" tone="#94a3b8"></app-kpi-card>
      <app-kpi-card label="Total Actual Hours" [value]="calcService.fh(agg().actual)" [subtext]="varianceTxt()" tone="#3b6fe0"></app-kpi-card>
      <app-kpi-card label="Total AI Hours" [value]="calcService.fh(agg().ai)" [subtext]="calcService.fp(calcService.safePct(agg().ai, agg().actual)) + ' of actual hours'" tone="#14b8a6"></app-kpi-card>
      <app-kpi-card label="Average Savings %" [value]="calcService.fp(agg().avgSavings)" [subtext]="'Across ' + agg().nPct + ' completed tasks'" tone="#f59e0b"></app-kpi-card>
      <app-kpi-card label="Total Effort Saved" [value]="calcService.fh(agg().saved) + ' h'" [subtext]="'Efficiency ' + calcService.fp(agg().efficiency)" tone="#10b981"></app-kpi-card>
      <app-kpi-card label="Task Completion Rate" [value]="calcService.fp(agg().completionRate)" [subtext]="agg().completed + ' / ' + agg().tasks + ' tasks'" tone="#8b5cf6"></app-kpi-card>
      <app-kpi-card label="Most Used AI Tool" [value]="agg().topTool" [subtext]="agg().topCount ? agg().topCount + ' tasks' : 'No AI usage yet'" tone="#ec4899" [small]="true"></app-kpi-card>
      <app-kpi-card label="Planned vs Actual" [value]="calcService.fh(agg().planned) + ' / ' + calcService.fh(agg().actual)" [subtext]="agg().planned ? calcService.fp(calcService.safePct(agg().actual, agg().planned)) + ' of plan used' : '0%'" tone="#0ea5e9" [small]="true"></app-kpi-card>
    </div>

    <!-- Charts -->
    <div class="grid g32">
      <app-chart-card title="Planned vs Actual Hours — Daily" sub="Bars: hours · line: AI hours">
        <canvas baseChart [data]="dailyChartData" [options]="dailyChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="AI Tool Usage" sub="Tasks per tool">
        <canvas baseChart [data]="toolsChartData" [options]="doughnutOptions" [type]="'doughnut'"></canvas>
      </app-chart-card>
    </div>

    <!-- Recent Tasks Table -->
    <div class="card">
      <app-data-table
        title="Recent Tasks"
        [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ') · ' + recentRows.length + ' entries'"
        [cols]="tableCols"
        [rows]="recentRows"
        [pageSize]="10"
        [pageSizeOptions]="[10, 25, 50]"
        [showPageSizeSelector]="true"
        [allowViewAll]="true">
      </app-data-table>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  ngOnInit(): void {
    this.dataService.loadTimesheetsFromBackend(this.emp().id);
  }
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;
  emp = this.dataService.currentEmployee;

  availableMonths = this.dataService.availableMonths;

  onMonthChange(m: string): void {
    this.dataService.updateUI({ month: m });
  }

  currentMonthEntries = computed(() => {
    return this.dataService.entries().filter(e => e.empId === this.emp().id && (e.month === this.ui().month || (e.date && e.date.startsWith(this.ui().month))));
  });

  agg = computed(() => {
    return this.calcService.agg(this.calcService.valid(this.currentMonthEntries()));
  });

  subStatus = computed(() => {
    return this.calcService.subStatus(this.emp().id, this.ui().month, this.dataService.entries());
  });

  statusUi = computed(() => {
    const s = this.subStatus();
    if (s.status === 'Submitted') return { cls: 'ok', icon: '🟢' };
    if (s.status === 'Partially Submitted') return { cls: 'warn', icon: '🟡' };
    return { cls: 'bad', icon: '🔴' };
  });

  subMsg = computed(() => {
    const s = this.subStatus();
    const lbl = this.calcService.mLong(this.ui().month);
    if (s.status === 'Submitted') return `All ${s.wd} working days covered for ${lbl}.`;
    if (s.status === 'Partially Submitted') return `${s.covered} of ${s.wd} working days submitted · ${s.missing} day(s) missing.`;
    return `No submitted entries yet for ${lbl}.`;
  });

  varianceTxt(): string {
    const v = this.agg().variance;
    const cls = v > 0 ? 'down' : (v < 0 ? 'up' : '');
    return `<span class="${cls}">${v > 0 ? '+' : ''}${this.calcService.fh(v)}h vs plan</span>`;
  }

  submitDrafts(): void {
    const count = this.dataService.submitMonth(this.emp().id, this.ui().month);
    alert(`Submitted ${count} draft(s) successfully.`);
  }

  // Daily Chart Setup
  get dailyChartData(): any {
    const list = this.currentMonthEntries();
    const days = Array.from(new Set(list.map(x => x.date))).sort();
    const by = (d: string) => this.calcService.agg(list.filter(x => x.date === d));

    return {
      labels: days.map(d => this.calcService.fDate(d)),
      datasets: [
        { label: 'Planned', data: days.map(d => by(d).planned), backgroundColor: '#94a3b8', borderRadius: 5 },
        { label: 'Actual', data: days.map(d => by(d).actual), backgroundColor: '#3b6fe0', borderRadius: 5 },
        { type: 'line', label: 'AI Hours', data: days.map(d => by(d).ai), borderColor: '#14b8a6', backgroundColor: '#14b8a6', tension: 0.3, borderWidth: 2.5, pointRadius: 3 }
      ]
    };
  }

  readonly dailyChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#eef1f6' } } }
  };

  // Tools Doughnut Chart Setup
  get toolsChartData(): ChartConfiguration<'doughnut'>['data'] {
    const tc = Object.entries(this.agg().toolCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
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

  get tableCols(): ColumnDef[] {
    return [
      { k: 'date', l: 'Date', f: (v) => this.calcService.fDate(v) },
      { k: 'project', l: 'Project' },
      { k: 'module', l: 'Module / Page' },
      { k: 'taskType', l: 'Task Type' },
      { k: 'details', l: 'Task Details', wrap: true },
      { k: 'planned', l: 'Planned', n: true },
      { k: 'actual', l: 'Actual', n: true },
      { k: 'aiHours', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Saved', n: true, f: (v) => `<span class="${v > 0 ? 'up' : (v < 0 ? 'down' : '')}">${this.calcService.fh(v)}</span>` },
      { k: 'savingsPct', l: 'Savings %', n: true, pct: true },
      { k: 'tool', l: 'AI Tool' },
      { k: 'status', l: 'Status', f: (v) => `<span class="badge ${v === 'Completed' ? 'ok' : (v === 'In Progress' ? 'info' : (v === 'Blocked' ? 'bad' : 'warn'))}">${v}</span>` },
      { k: 'state', l: 'State', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : 'mute'}">${v}</span>` }
    ];
  }

  get recentRows(): any[] {
    return [...this.currentMonthEntries()]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }
}
