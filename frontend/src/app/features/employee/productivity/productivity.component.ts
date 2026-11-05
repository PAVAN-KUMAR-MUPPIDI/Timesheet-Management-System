import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-employee-productivity',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>My Productivity</h2>
        <p>Efficiency, time savings and task history · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
      <div class="sp"></div>
      <label class="ctl">
        Month
        <select [ngModel]="ui().month" (ngModelChange)="onMonthChange($event)">
          <option *ngFor="let m of availableMonths()" [value]="m">{{ calcService.mLong(m) }} ({{ m }})</option>
        </select>
      </label>
    </div>

    <!-- 6 KPI Grid -->
    <div class="kpis">
      <app-kpi-card label="Efficiency %" [value]="calcService.fp(agg().efficiency)" subtext="Effort saved ÷ planned hours" tone="#f59e0b"></app-kpi-card>
      <app-kpi-card label="Effort Saved" [value]="calcService.fh(agg().saved) + ' h'" [subtext]="calcService.fh(agg().aiSaved) + ' h on AI tasks'" tone="#10b981"></app-kpi-card>
      <app-kpi-card label="Average Savings %" [value]="calcService.fp(agg().avgSavings)" subtext="Per completed task"></app-kpi-card>
      <app-kpi-card label="Completion Rate" [value]="calcService.fp(agg().completionRate)" [subtext]="agg().completed + ' of ' + agg().tasks" tone="#8b5cf6"></app-kpi-card>
      <app-kpi-card label="Planned vs Actual" [value]="calcService.fh(agg().planned) + ' / ' + calcService.fh(agg().actual)" [subtext]="varianceTxt()" tone="#0ea5e9" [small]="true"></app-kpi-card>
      <app-kpi-card label="AI Hours" [value]="calcService.fh(agg().ai)" [subtext]="calcService.fp(agg().adoption) + ' tasks AI-assisted'" tone="#14b8a6"></app-kpi-card>
    </div>

    <!-- Charts -->
    <div class="grid g2">
      <app-chart-card title="Productivity Trend" sub="Monthly hours and efficiency %">
        <canvas baseChart [data]="trendChartData" [options]="trendChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="Efficiency by Task Type" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="typeChartData" [options]="typeChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
    </div>

    <!-- Project Breakdown Table -->
    <div class="card" style="margin-bottom:16px">
      <app-data-table title="Project Breakdown" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'" [cols]="projCols" [rows]="projectRows" [noSearch]="true"></app-data-table>
    </div>

    <!-- Task History Table -->
    <div class="card">
      <app-data-table title="Task History" sub="All months" [pageSize]="15" [cols]="historyCols" [rows]="historyRows"></app-data-table>
    </div>
  `
})
export class ProductivityComponent {
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

  varianceTxt(): string {
    const v = this.agg().variance;
    const cls = v > 0 ? 'down' : (v < 0 ? 'up' : '');
    return `<span class="${cls}">${v > 0 ? '+' : ''}${this.calcService.fh(v)}h vs plan</span>`;
  }

  // Monthly Trend Chart
  get trendChartData(): any {
    const months = this.dataService.availableMonths();
    const rows = months.map(m => {
      const list = this.dataService.entries().filter(e => e.empId === this.emp().id && e.month === m);
      return { label: this.calcService.mLabel(m), ...this.calcService.agg(this.calcService.valid(list)) };
    });

    return {
      labels: rows.map(r => r.label),
      datasets: [
        { label: 'Planned', data: rows.map(r => r.planned), backgroundColor: '#94a3b8', borderRadius: 5 },
        { label: 'Actual', data: rows.map(r => r.actual), backgroundColor: '#3b6fe0', borderRadius: 5 },
        { label: 'Saved', data: rows.map(r => r.saved), backgroundColor: '#10b981', borderRadius: 5 },
        { type: 'line', label: 'Efficiency %', data: rows.map(r => r.efficiency), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.3, yAxisID: 'y1', borderWidth: 2.5, pointRadius: 3 }
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

  // Task Type Chart
  get typeChartData(): ChartConfiguration<'bar'>['data'] {
    const list = this.currentMonthEntries();
    const types = Array.from(new Set(list.map(x => x.taskType)));
    const ta = types.map(t => this.calcService.agg(this.calcService.valid(list.filter(x => x.taskType === t))));

    return {
      labels: types,
      datasets: [
        { label: 'Efficiency %', data: ta.map(x => x.efficiency), backgroundColor: '#f59e0b', borderRadius: 5 },
        { label: 'Avg Savings %', data: ta.map(x => x.avgSavings), backgroundColor: '#8b5cf6', borderRadius: 5 }
      ]
    };
  }

  readonly typeChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    indexAxis: 'y',
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { beginAtZero: true, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }
  };

  get projCols(): ColumnDef[] {
    return [
      { k: 'project', l: 'Project' },
      { k: 'tasks', l: 'Tasks', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'ai', l: 'AI Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true },
      { k: 'completion', l: 'Completion %', n: true, pct: true }
    ];
  }

  get projectRows(): any[] {
    const list = this.currentMonthEntries();
    const projs = Array.from(new Set(list.map(x => x.project)));
    return projs.map(p => {
      const pa = this.calcService.agg(this.calcService.valid(list.filter(x => x.project === p)));
      return {
        project: p,
        tasks: pa.tasks,
        planned: pa.planned,
        actual: pa.actual,
        ai: pa.ai,
        saved: pa.saved,
        eff: pa.efficiency,
        completion: pa.completionRate
      };
    });
  }

  get historyCols(): ColumnDef[] {
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
      { k: 'status', l: 'Status', f: (v) => `<span class="badge ${v === 'Completed' ? 'ok' : 'warn'}">${v}</span>` },
      { k: 'state', l: 'State', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : 'mute'}">${v}</span>` }
    ];
  }

  get historyRows(): any[] {
    return [...this.dataService.entries().filter(e => e.empId === this.emp().id)]
      .sort((a, b) => b.date.localeCompare(a.date));
  }
}
