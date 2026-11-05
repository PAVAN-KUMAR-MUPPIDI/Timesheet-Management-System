import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-employee-submission-history',
  standalone: true,
  imports: [CommonModule, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Submission History</h2>
        <p>Monthly timesheet submission record</p>
      </div>
    </div>

    <!-- 3 Stat Cards -->
    <div class="stat-cards">
      <div class="stat ok">
        <div class="e">🟢</div>
        <div>
          <div class="n">{{ countStatus('Submitted') }}</div>
          <div class="lb">Submitted</div>
          <div class="ds">months fully submitted</div>
        </div>
      </div>

      <div class="stat warn">
        <div class="e">🟡</div>
        <div>
          <div class="n">{{ countStatus('Partially Submitted') }}</div>
          <div class="lb">Partially Submitted</div>
          <div class="ds">months with missing days</div>
        </div>
      </div>

      <div class="stat bad">
        <div class="e">🔴</div>
        <div>
          <div class="n">{{ countStatus('Not Submitted') }}</div>
          <div class="lb">Not Submitted</div>
          <div class="ds">months with no submission</div>
        </div>
      </div>
    </div>

    <!-- Monthly Submissions Table -->
    <div class="card">
      <app-data-table title="Monthly Submissions" [cols]="tableCols" [rows]="rows()" [rowClass]="getRowClass"></app-data-table>
    </div>
  `
})
export class SubmissionHistoryComponent {
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);

  ui = this.dataService.ui;
  emp = this.dataService.currentEmployee;

  rows = computed(() => {
    return this.dataService.availableMonths().slice().reverse().map(m => {
      const s = this.calcService.subStatus(this.emp().id, m, this.dataService.entries());
      const a = this.calcService.agg(this.dataService.entries().filter(e => e.empId === this.emp().id && e.month === m && e.state === 'Submitted' && !e._dup && !e._inc));
      return {
        month: m,
        label: this.calcService.mLong(m),
        status: s.status,
        wd: s.wd,
        covered: s.covered,
        missing: s.missing,
        coverage: s.coverage,
        entries: s.entries,
        drafts: s.drafts,
        excluded: s.excluded,
        hours: a.actual,
        last: s.last ? s.last.slice(0, 10) : ''
      };
    });
  });

  countStatus(statusStr: string): number {
    return this.rows().filter(r => r.status === statusStr).length;
  }

  getRowClass(r: any): string {
    if (r.status === 'Not Submitted') return 'row-alert';
    if (r.status === 'Partially Submitted') return 'row-warn';
    return '';
  }

  get tableCols(): ColumnDef[] {
    return [
      { k: 'label', l: 'Month' },
      { k: 'status', l: 'Status', f: (v) => `<span class="badge ${v === 'Submitted' ? 'ok' : (v === 'Partially Submitted' ? 'warn' : 'bad')}">${v === 'Submitted' ? '🟢' : (v === 'Partially Submitted' ? '🟡' : '🔴')} ${v}</span>` },
      { k: 'wd', l: 'Working Days', n: true },
      { k: 'covered', l: 'Days Submitted', n: true },
      { k: 'missing', l: 'Days Missing', n: true },
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
      { k: 'entries', l: 'Submitted Entries', n: true },
      { k: 'drafts', l: 'Drafts', n: true },
      { k: 'excluded', l: 'Excluded (dup/incomplete)', n: true },
      { k: 'hours', l: 'Actual Hrs', n: true },
      { k: 'last', l: 'Last Submitted', f: (v) => this.calcService.fDateY(v) }
    ];
  }
}
