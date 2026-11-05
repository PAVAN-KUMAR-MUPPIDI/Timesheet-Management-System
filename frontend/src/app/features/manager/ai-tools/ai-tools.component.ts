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
  selector: 'app-manager-ai-tools',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, FilterBarComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>AI Tools Analysis</h2>
        <p>Tool-level adoption, hours and efficiency · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <app-filter-bar></app-filter-bar>

    <!-- 5 KPI Cards -->
    <div class="kpis">
      <app-kpi-card label="Tools in Use" [value]="usedTools().length" [subtext]="'of ' + totalTrackedTools() + ' tracked tools'" tone="#8b5cf6"></app-kpi-card>
      <app-kpi-card label="AI-Assisted Tasks" [value]="agg().aiTasks" [subtext]="calcService.fp(agg().adoption) + ' of all tasks'" tone="#14b8a6"></app-kpi-card>
      <app-kpi-card label="AI Hours" [value]="calcService.fh(agg().ai)" subtext="Hours of AI-assisted effort" tone="#14b8a6"></app-kpi-card>
      <app-kpi-card label="Hours Saved via AI" [value]="calcService.fh(agg().aiSaved) + ' h'" [subtext]="'AI efficiency ' + calcService.fp(calcService.safePct(agg().aiSaved, agg().aiPlannedApp))" tone="#10b981"></app-kpi-card>
      <app-kpi-card label="Top Tool" [value]="agg().topTool" [subtext]="agg().topCount ? agg().topCount + ' tasks' : '—'" tone="#ec4899" [small]="true"></app-kpi-card>
    </div>

    <!-- Charts -->
    <div class="grid g2">
      <app-chart-card title="Total Tasks by AI Tool" sub="Sorted by usage" [tall]="true">
        <canvas baseChart [data]="ttChartData" [options]="ttChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="Hours Saved & Efficiency by Tool" sub="Bars: hours saved · line: efficiency %" [tall]="true">
        <canvas baseChart [data]="tsChartData" [options]="tsChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
    </div>

    <!-- AI Tools Analysis Table -->
    <div class="card" style="margin-bottom:16px">
      <app-data-table title="AI Tools Analysis" sub="All tracked tools · submitted timesheets" [cols]="toolCols" [rows]="toolRows()"></app-data-table>
    </div>

    <!-- Employee x Tool Matrix Heatmap Table -->
    <div class="card">
      <app-data-table title="Employee × Tool Matrix" sub="Task count heatmap" [cols]="matrixCols()" [rows]="usedToolsRows()" [noSearch]="true" emptyMsg="No AI usage for this selection"></app-data-table>
    </div>
  `
})
export class AiToolsComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;
  totalTrackedTools = computed(() => this.dataService.activeAiTools().length);

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

  toolRows = computed(() => {
    const list = this.validSubmittedEntries();
    const emps = this.scopedEmployees();
    const empMap = new Map(emps.map(e => [e.id, e.name]));

    return this.dataService.activeAiTools().map(t => {
      const l = list.filter(e => e.tool === t);
      const a = this.calcService.agg(l);
      const by: { [name: string]: number } = {};
      l.forEach(e => {
        const n = empMap.get(e.empId) || e.empId;
        by[n] = (by[n] || 0) + 1;
      });
      const byStr = Object.entries(by).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n}: ${c}`).join('; ') || '—';

      return {
        tool: t,
        by,
        byStr,
        tasks: a.tasks,
        users: Object.keys(by).length,
        planned: a.planned,
        actual: a.actual,
        ai: a.ai,
        saved: a.saved,
        eff: a.efficiency
      };
    }).sort((x, y) => y.tasks - x.tasks);
  });

  usedTools = computed(() => {
    return this.toolRows().filter(r => r.tasks > 0);
  });

  usedToolsRows = computed(() => {
    return this.usedTools();
  });

  // Tasks by Tool Chart
  get ttChartData(): ChartConfiguration<'bar'>['data'] {
    const s = this.usedTools();
    return {
      labels: s.map(r => r.tool),
      datasets: [{ label: 'Tasks', data: s.map(r => r.tasks), backgroundColor: '#14b8a6', borderRadius: 5 }]
    };
  }

  readonly ttChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }
  };

  // Hours Saved & Efficiency Dual-Axis Chart
  get tsChartData(): any {
    const s = this.usedTools();
    return {
      labels: s.map(r => r.tool),
      datasets: [
        { label: 'Hours Saved', data: s.map(r => r.saved), backgroundColor: '#10b981', borderRadius: 5 },
        { type: 'line', label: 'Efficiency %', data: s.map(r => r.eff), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.3, yAxisID: 'y1', borderWidth: 2.5, pointRadius: 3 }
      ]
    };
  }

  readonly tsChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 60, minRotation: 35 } },
      y: { beginAtZero: true, grid: { color: '#eef1f6' }, title: { display: true, text: 'Hours' } },
      y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' }, title: { display: true, text: '%' } }
    }
  };

  get toolCols(): ColumnDef[] {
    return [
      { k: 'tool', l: 'AI Tool' },
      {
        k: 'byStr', l: 'Employee-wise Task Count', wrap: true,
        f: (v, r) => Object.keys(r.by).length
          ? Object.entries(r.by).sort((a: any, b: any) => b[1] - a[1]).map(([n, c]) => `<span class="chip">${n} <b>${c}</b></span>`).join('')
          : '<span style="color:#cbd5e1">—</span>'
      },
      { k: 'tasks', l: 'Total Tasks', n: true },
      { k: 'planned', l: 'Planned Hrs', n: true },
      { k: 'actual', l: 'Actual Hrs', n: true },
      { k: 'saved', l: 'Hrs Saved', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true }
    ];
  }

  matrixCols = computed(() => {
    const emps = this.scopedEmployees();
    const rows = this.usedTools();
    const maxVal = Math.max(1, ...rows.map(r => Math.max(0, ...Object.values(r.by as { [name: string]: number }))));

    const eCols: ColumnDef[] = emps.map(e => ({
      k: 'e_' + e.id,
      l: e.name.split(' ')[0],
      n: true,
      v: (r) => r.by[e.name] || 0,
      f: (v) => v ? `<span class="heat" style="background:rgba(59,111,224,${.12 + .6 * v / maxVal}); color:${v / maxVal > .55 ? '#fff' : '#1e3a8a'}">${v}</span>` : '<span style="color:#cbd5e1">0</span>'
    }));

    return [
      { k: 'tool', l: 'AI Tool' },
      ...eCols,
      { k: 'tasks', l: 'Total', n: true }
    ];
  });
}
