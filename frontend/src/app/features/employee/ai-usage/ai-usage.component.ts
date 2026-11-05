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
  selector: 'app-employee-ai-usage',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>AI Usage</h2>
        <p>How AI tools contribute to your work · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
      <div class="d-flex align-center gap-2">
        <label class="ctl">
          Month
          <select [ngModel]="ui().month" (ngModelChange)="onMonthChange($event)">
            <option *ngFor="let m of availableMonths()" [value]="m">{{ calcService.mLong(m) }} ({{ m }})</option>
          </select>
        </label>
      </div>
    </div>

    <!-- 6 AI KPI Grid -->
    <div class="kpis">
      <app-kpi-card label="AI-Assisted Tasks" [value]="agg().aiTasks" [subtext]="'of ' + agg().tasks + ' total tasks'" tone="#14b8a6"></app-kpi-card>
      <app-kpi-card label="AI Adoption" [value]="calcService.fp(agg().adoption)" subtext="Tasks using an AI tool" tone="#3b6fe0"></app-kpi-card>
      <app-kpi-card label="AI Hours" [value]="calcService.fh(agg().ai)" [subtext]="'Manual: ' + calcService.fh(agg().manual) + ' h'" tone="#14b8a6"></app-kpi-card>
      <app-kpi-card label="Hours Saved with AI" [value]="calcService.fh(agg().aiSaved) + ' h'" [subtext]="'AI efficiency ' + calcService.fp(calcService.safePct(agg().aiSaved, agg().aiPlannedApp))" tone="#10b981"></app-kpi-card>
      <app-kpi-card label="Tools Used" [value]="agg().toolsUsed.length" [subtext]="agg().toolsUsed.slice(0, 3).join(', ') || '—'" tone="#8b5cf6"></app-kpi-card>
      <app-kpi-card label="Most Used AI Tool" [value]="agg().topTool" [subtext]="agg().topCount ? agg().topCount + ' tasks' : '—'" tone="#ec4899" [small]="true"></app-kpi-card>
    </div>

    <!-- Charts -->
    <div class="grid g3">
      <app-chart-card title="Tasks by AI Tool" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="toolBarData" [options]="toolBarOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="AI vs Manual Effort" sub="Hours">
        <canvas baseChart [data]="doughnutData" [options]="doughnutOptions" [type]="'doughnut'"></canvas>
      </app-chart-card>
      <app-chart-card title="AI Adoption Trend" sub="% of tasks using AI per month">
        <canvas baseChart [data]="trendData" [options]="trendOptions" [type]="'line'"></canvas>
      </app-chart-card>
    </div>

    <!-- Tool Breakdown Table -->
    <div class="card">
      <app-data-table title="My AI Tool Breakdown" [cols]="tableCols" [rows]="toolRows" emptyMsg="No AI-assisted tasks in this period"></app-data-table>
    </div>
  `
})
export class AiUsageComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;
  emp = this.dataService.currentEmployee;
  availableMonths = this.dataService.availableMonths;

  onMonthChange(month: string): void {
    this.dataService.updateUI({ month });
  }

  currentPeriodEntries = computed(() => {
    return this.dataService.entries().filter(e => e.empId === this.emp().id && (e.month === this.ui().month || (e.date && e.date.startsWith(this.ui().month))));
  });

  agg = computed(() => {
    return this.calcService.agg(this.calcService.valid(this.currentPeriodEntries()));
  });

  get toolRows(): any[] {
    const list = this.calcService.valid(this.currentPeriodEntries());
    const tools = this.dataService.activeAiTools();
    return tools.map(t => {
      const l = list.filter(e => e.tool === t);
      const a = this.calcService.agg(l);
      return {
        tool: t,
        tasks: a.tasks,
        ai: a.ai,
        planned: a.planned,
        actual: a.actual,
        saved: a.saved,
        eff: a.efficiency
      };
    }).filter(r => r.tasks > 0).sort((a, b) => b.tasks - a.tasks);
  }

  // Tool Bar Chart
  get toolBarData(): ChartConfiguration<'bar'>['data'] {
    const rows = this.toolRows;
    return {
      labels: rows.map(r => r.tool),
      datasets: [{
        label: 'Tasks',
        data: rows.map(r => r.tasks),
        backgroundColor: '#14b8a6',
        borderRadius: 5
      }]
    };
  }

  readonly toolBarOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }
  };

  // Doughnut Chart
  get doughnutData(): ChartConfiguration<'doughnut'>['data'] {
    const a = this.agg();
    return {
      labels: ['AI Hours', 'Manual Hours'],
      datasets: [{
        data: [this.calcService.r2(a.ai), this.calcService.r2(a.manual)],
        backgroundColor: ['#14b8a6', '#cbd5e1'],
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

  // Adoption Trend Chart
  get trendData(): ChartConfiguration<'line'>['data'] {
    const months = this.dataService.availableMonths();
    const rows = months.map(m => {
      const list = this.dataService.entries().filter(e => e.empId === this.emp().id && e.month === m);
      return { label: this.calcService.mLabel(m), ...this.calcService.agg(this.calcService.valid(list)) };
    });

    return {
      labels: rows.map(r => r.label),
      datasets: [
        { label: 'AI adoption %', data: rows.map(r => r.adoption), borderColor: '#3b6fe0', backgroundColor: 'rgba(59,111,224,.12)', fill: true, tension: 0.3, pointRadius: 3 },
        { label: 'Efficiency %', data: rows.map(r => r.efficiency), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.3, pointRadius: 3 }
      ]
    };
  }

  readonly trendOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => v + '%' } } }
  };

  get tableCols(): ColumnDef[] {
    return [
      { k: 'tool', l: 'AI Tool' },
      { k: 'tasks', l: 'Tasks', n: true },
      { k: 'ai', l: 'AI Hrs', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true }
    ];
  }
}
