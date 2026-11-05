import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-manager-employee-adoption',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, FilterBarComponent, ChartCardComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Employee Adoption</h2>
        <p>AI adoption summary · {{ calcService.mLong(ui().month) }} ({{ ui().month }})</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <app-filter-bar></app-filter-bar>

    <!-- Pending Submissions Alert Banner -->
    <div class="banner bad" *ngIf="pendingSubmissionsText()">
      <div style="font-size:20px">🔴</div>
      <div>
        <div class="t">Timesheets pending for {{ calcService.mLong(ui().month) }} ({{ ui().month }})</div>
        <div class="d" [innerHTML]="pendingSubmissionsText()"></div>
      </div>
    </div>

    <!-- Charts -->
    <div class="grid g2">
      <app-chart-card title="AI Hours & Tasks with AI by Employee" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="ad1ChartData" [options]="ad1ChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
      <app-chart-card title="Distinct Tools Used per Employee" [sub]="calcService.mLong(ui().month) + ' (' + ui().month + ')'">
        <canvas baseChart [data]="ad2ChartData" [options]="ad2ChartOptions" [type]="'bar'"></canvas>
      </app-chart-card>
    </div>

    <!-- Adoption Summary Table -->
    <div class="card">
      <app-data-table title="Employee Adoption Summary" [cols]="tableCols" [rows]="rows()" [rowClass]="getRowClass"></app-data-table>
    </div>
  `
})
export class EmployeeAdoptionComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;

  scopedEmployees = computed(() => {
    const t = this.ui().mTeam;
    const e = this.ui().mEmp;
    return this.dataService.employees().filter(x => (t === 'all' || x.team === t) && (e === 'all' || x.id === e));
  });

  rows = computed(() => {
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
        aiTasks: a.aiTasks,
        ai: a.ai,
        eff: a.efficiency,
        topTool: a.topTool,
        topCount: a.topCount,
        toolsN: a.toolsUsed.length,
        _a: a
      };
    });
  });

  pendingSubmissionsText = computed(() => {
    const list = this.rows();
    const ns = list.filter(r => r.status === 'Not Submitted');
    const ps = list.filter(r => r.status === 'Partially Submitted');
    if (!ns.length && !ps.length) return '';

    let html = '';
    if (ns.length) html += `<b>Not submitted:</b> ${ns.map(r => r.name).join(', ')}`;
    if (ns.length && ps.length) html += ' &nbsp;|&nbsp; ';
    if (ps.length) html += `<b>Partially submitted:</b> ${ps.map(r => r.name).join(', ')}`;
    return html;
  });

  getRowClass(r: any): string {
    if (r.status === 'Not Submitted') return 'row-alert';
    if (r.status === 'Partially Submitted') return 'row-warn';
    return '';
  }

  // AI Hours & Tasks Chart
  get ad1ChartData(): ChartConfiguration<'bar'>['data'] {
    const r = this.rows();
    return {
      labels: r.map(x => x.name.split(' ')[0]),
      datasets: [
        { label: 'AI Hours', data: r.map(x => x.ai), backgroundColor: '#14b8a6', borderRadius: 5 },
        { label: 'Tasks with AI', data: r.map(x => x.aiTasks), backgroundColor: '#8b5cf6', borderRadius: 5 }
      ]
    };
  }

  readonly ad1ChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
  };

  // Distinct Tools Used Chart
  get ad2ChartData(): ChartConfiguration<'bar'>['data'] {
    const r = this.rows();
    return {
      labels: r.map(x => x.name.split(' ')[0]),
      datasets: [{
        label: 'Tools used',
        data: r.map(x => x.toolsN),
        backgroundColor: r.map(x => x.status === 'Not Submitted' ? '#fca5a5' : '#3b6fe0'),
        borderRadius: 5
      }]
    };
  }

  readonly ad2ChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  get tableCols(): ColumnDef[] {
    return [
      {
        k: 'name', l: 'Employee Name',
        f: (v, r) => `<b>${v}</b>${r.status === 'Not Submitted' ? ' <span class="badge bad">Pending</span>' : ''}`
      },
      { k: 'team', l: 'Team' },
      {
        k: 'tools', l: 'Tools Used', wrap: true,
        f: (v, r) => r._a.toolsUsed.length ? r._a.toolsUsed.map((t: string) => `<span class="chip">${t}</span>`).join('') : '<span style="color:#94a3b8">—</span>'
      },
      { k: 'aiTasks', l: 'Tasks with AI', n: true },
      { k: 'ai', l: 'AI Hours', n: true },
      { k: 'eff', l: 'Efficiency %', n: true, pct: true },
      { k: 'topTool', l: 'Top AI Tool' },
      { k: 'topCount', l: 'Usage Count', n: true },
      { k: 'status', l: 'Timesheet Submission Status', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : (v === 'Partially Submitted' ? 'warn' : 'bad')}">${v}</span>` }
    ];
  }
}
