import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-manager-timesheet-status',
  standalone: true,
  imports: [CommonModule, FilterBarComponent, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Timesheet Status</h2>
        <p>Submission tracking for {{ calcService.mLong(ui().month) }} ({{ ui().month }}) · {{ activeWdCount() }} working days to date</p>
      </div>
    </div>

    <!-- Filter Bar with Chips -->
    <app-filter-bar>
      <div class="chips-f">
        <button [class.on]="statusFilter() === 'all'" (click)="setFilter('all')">All</button>
        <button [class.on]="statusFilter() === 'Submitted'" (click)="setFilter('Submitted')">🟢 Submitted</button>
        <button [class.on]="statusFilter() === 'Partially Submitted'" (click)="setFilter('Partially Submitted')">🟡 Partially Submitted</button>
        <button [class.on]="statusFilter() === 'Not Submitted'" (click)="setFilter('Not Submitted')">🔴 Not Submitted</button>
      </div>
    </app-filter-bar>

    <!-- 3 Stat Summary Cards (Clickable filters) -->
    <div class="stat-cards">
      <div class="stat ok" (click)="setFilter(statusFilter() === 'Submitted' ? 'all' : 'Submitted')" style="cursor:pointer" title="Click to filter by Submitted">
        <div class="e">🟢</div>
        <div>
          <div class="n">{{ countStatus('Submitted') }}</div>
          <div class="lb">Submitted</div>
          <div class="ds">All working days submitted</div>
        </div>
      </div>

      <div class="stat warn" (click)="setFilter(statusFilter() === 'Partially Submitted' ? 'all' : 'Partially Submitted')" style="cursor:pointer" title="Click to filter by Partially Submitted">
        <div class="e">🟡</div>
        <div>
          <div class="n">{{ countStatus('Partially Submitted') }}</div>
          <div class="lb">Partially Submitted</div>
          <div class="ds">Some days missing</div>
        </div>
      </div>

      <div class="stat bad" (click)="setFilter(statusFilter() === 'Not Submitted' ? 'all' : 'Not Submitted')" style="cursor:pointer" title="Click to filter by Not Submitted">
        <div class="e">🔴</div>
        <div>
          <div class="n">{{ countStatus('Not Submitted') }}</div>
          <div class="lb">Not Submitted</div>
          <div class="ds">No submitted entries</div>
        </div>
      </div>
    </div>

    <!-- Submission Status Table -->
    <div class="card">
      <app-data-table title="Timesheet Submission Status" [cols]="tableCols" [rows]="filteredStatusRows()" [rowClass]="getRowClass"></app-data-table>
      <div class="legend" style="margin-top:10px; justify-content:center;">
        <span><i style="background:#22c55e"></i>Submitted day</span>
        <span><i style="background:#facc15"></i>Draft only</span>
        <span><i style="background:#fecaca"></i>Missing</span>
      </div>
    </div>
  `
})
export class TimesheetStatusComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;
  statusFilter = signal<string>('all');

  setFilter(f: string): void {
    this.statusFilter.set(f);
  }

  scopedEmployees = computed(() => {
    const t = this.ui().mTeam;
    const e = this.ui().mEmp;
    return this.dataService.employees().filter(x => (t === 'all' || x.team === t) && (e === 'all' || x.id === e));
  });

  allStatusRows = computed(() => {
    const m = this.ui().month;
    return this.scopedEmployees().map(e => {
      const s = this.calcService.subStatus(e.id, m, this.dataService.entries());
      return {
        id: e.id,
        name: e.name,
        team: e.team,
        status: s.status,
        wd: s.wd,
        covered: s.covered,
        missing: s.missing,
        coverage: s.coverage,
        entries: s.entries,
        drafts: s.drafts,
        excluded: s.excluded,
        last: s.last ? s.last.slice(0, 10) : '',
        _s: s
      };
    });
  });

  filteredStatusRows = computed(() => {
    const f = this.statusFilter();
    return this.allStatusRows().filter(r => f === 'all' || r.status === f);
  });

  countStatus(statusStr: string): number {
    return this.allStatusRows().filter(r => r.status === statusStr).length;
  }

  activeWdCount = computed(() => {
    const rows = this.allStatusRows();
    return rows.length > 0 ? rows[0].wd : this.calcService.workDays(this.ui().month).length;
  });

  getRowClass(r: any): string {
    if (r.status === 'Not Submitted') return 'row-alert';
    if (r.status === 'Partially Submitted') return 'row-warn';
    return '';
  }

  get tableCols(): ColumnDef[] {
    return [
      {
        k: 'name', l: 'Employee',
        f: (v, r) => `<div style="display:flex;align-items:center;justify-content:center;gap:8px">
          <div class="avatar" style="width:28px;height:28px;font-size:11px;background:${r.status === 'Not Submitted' ? '#dc2626' : (r.status === 'Partially Submitted' ? '#d97706' : '#16a34a')}"></div>
          <b>${v}</b>
        </div>`
      },
      { k: 'team', l: 'Team' },
      { k: 'status', l: 'Status', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : (v === 'Partially Submitted' ? 'warn' : 'bad')}">${v}</span>` },
      { k: 'wd', l: 'Working Days', n: true },
      { k: 'covered', l: 'Days Submitted', n: true },
      { k: 'missing', l: 'Missing Days', n: true },
      {
        k: 'coverage',
        l: 'Coverage',
        f: (v, r) => {
          const pct = Math.min(100, Math.max(0, Number(v) || 0));
          const isDone = pct >= 100;
          const isPartial = pct > 0 && pct < 100;
          const barColor = isDone
            ? 'linear-gradient(90deg, #10b981, #059669)'
            : (pct >= 50
                ? 'linear-gradient(90deg, #3b82f6, #2563eb)'
                : (isPartial
                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : '#ef4444'));
          const textColor = isDone ? '#059669' : (pct >= 50 ? '#2563eb' : (isPartial ? '#d97706' : '#dc2626'));
          const badgeText = `${pct.toFixed(1)}%`;
          return `<div style="display:flex;align-items:center;justify-content:center;gap:10px;min-width:150px;margin:0 auto" title="${r.covered} of ${r.wd} working days submitted (${badgeText} completed)">
            <div style="flex:1;height:9px;background:#e2e8f0;border-radius:999px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.06)">
              <div style="width:${pct}%;height:100%;border-radius:999px;background:${barColor};transition:width 0.3s ease"></div>
            </div>
            <span style="font-size:12px;font-weight:700;min-width:44px;text-align:right;color:${textColor}">${badgeText}</span>
          </div>`;
        },
        x: (r) => this.calcService.r2(r.coverage)
      },
      {
        k: '_days', l: 'Daily Coverage', noExport: true, v: () => '',
        f: (v, r) => `<div class="days" style="display:flex;justify-content:center;margin:0 auto">${r._s.wdList.map((d: string) => `<i class="${r._s.filled.has(d) ? 's' : (r._s.draftDates.has(d) ? 'd' : '')}" title="${this.calcService.fDate(d)}"></i>`).join('')}</div>`
      },
      { k: 'entries', l: 'Entries', n: true },
      { k: 'drafts', l: 'Drafts', n: true },
      { k: 'last', l: 'Last Submitted', f: (v) => this.calcService.fDateY(v) }
    ];
  }
}
