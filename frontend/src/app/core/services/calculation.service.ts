import { Injectable } from '@angular/core';

import { TimesheetEntry, Employee, SubStatus, AggMetrics } from '../models/models';



export const TOOLS: string[] = [];
export const NO_AI = '';
export const STATUSES: string[] = [];
export const PRIORITIES: string[] = [];
export const PROJECTS: string[] = [];
export const MODULES: string[] = [];
export const TEAMS: string[] = [];
export const TASK_TYPES: string[] = [];
export const MANAGER: any = null;
export const PERIOD_OPTIONS = ['Current Week', 'Last Week', 'Current Month', 'Last Month'];



@Injectable({

  providedIn: 'root'

})

export class CalculationService {



  num(v: any): number {

    const n = parseFloat(v);

    return isFinite(n) ? n : 0;

  }



  safePct(a: number, b: number): number {

    return (b > 0 && isFinite(a)) ? (a / b * 100) : 0;

  }



  r2(v: number): number {

    return Math.round((isFinite(+v) ? +v : 0) * 100) / 100;

  }



  fh(v: number): string {

    const val = this.r2(v);

    return Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/0$/, '');

  }



  fp(v: number): string {

    return (isFinite(v) ? v : 0).toFixed(1) + '%';

  }



  pad(n: number): string {

    return String(n).padStart(2, '0');

  }



  iso(d: Date): string {

    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;

  }



  parse(s: string): Date {

    const [y, m, d] = s.split('-').map(Number);

    return new Date(y, m - 1, d);

  }



  get TODAY(): string {

    return this.iso(new Date());

  }



  get CUR_MONTH(): string {

    return this.TODAY.slice(0, 7);

  }



  mLabel(k: string): string {

    if (!k) return '';

    const [y, m] = k.split('-').map(Number);

    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });

  }



  mLong(k: string): string {

    if (!k) return '';

    const [y, m] = k.split('-').map(Number);

    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  }



  fDate(s: string): string {

    return s ? this.parse(s).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : '';

  }



  fDateY(s: string): string {

    return s ? this.parse(s.slice(0, 10)).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  }



  initials(n: string): string {

    if (!n) return '';

    return n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

  }



  workDays(mk: string): string[] {

    const [y, m] = mk.split('-').map(Number);

    const n = new Date(y, m, 0).getDate();

    const out: string[] = [];

    for (let d = 1; d <= n; d++) {

      const dt = new Date(y, m - 1, d);

      const s = this.iso(dt);

      if (s > this.TODAY) break;

      const w = dt.getDay();

      if (w > 0 && w < 6) out.push(s);

    }

    return out;

  }



  weekStart(s: string): string {

    const d = this.parse(s);

    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));

    return this.iso(d);

  }



  isAI(e: { tool?: string }): boolean {

    return !!e.tool && e.tool !== NO_AI && e.tool !== 'None (Manual)' && e.tool !== 'None' && e.tool !== 'N/A' && e.tool.trim() !== '';

  }



  calc(e: TimesheetEntry): { planned: number; actual: number; ai: number; manual: number; saved: number; savingsPct: number; applicable: boolean } {

    const planned = Math.max(0, this.num(e.planned));

    const actual = Math.max(0, this.num(e.actual));

    const ai = Math.max(0, this.num(e.aiHours));

    const manual = Math.max(0, actual - ai);

    const applicable = planned > 0 && actual > 0;

    const saved = applicable ? (planned - actual) : 0;

    return {

      planned,

      actual,

      ai,

      manual,

      saved,

      savingsPct: applicable ? this.safePct(saved, planned) : 0,

      applicable

    };

  }



  isComplete(e: TimesheetEntry): boolean {

    const aiHours = this.num(e.aiHours);

    const tool = String(e.tool || '').trim();

    const toolOk = aiHours > 0 ? (tool !== '' && tool !== NO_AI && tool !== 'None (Manual)' && tool !== 'None') : true;

    return !!(e.date && e.project && e.taskType && String(e.details || '').trim() && e.status && toolOk && this.num(e.planned) > 0 && String(e.actual) !== '' && e.actual != null && isFinite(parseFloat(e.actual as any)));

  }



  dupKey(e: TimesheetEntry): string {

    return [e.empId, e.date, e.project, e.module || '', e.taskType, String(e.details || '').trim().toLowerCase()].join('|').toLowerCase();

  }



  annotate(entries: TimesheetEntry[]): TimesheetEntry[] {

    const seen = new Set<string>();

    const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);

    sorted.forEach(e => {

      e._inc = !this.isComplete(e);

      const k = this.dupKey(e);

      e._dup = !e._inc && seen.has(k);

      if (!e._inc && !e._dup) seen.add(k);

    });

    return sorted;

  }



  valid(entries: TimesheetEntry[]): TimesheetEntry[] {

    return this.annotate(entries).filter(e => !e._dup && !e._inc);

  }



  agg(list: TimesheetEntry[]): AggMetrics {

    const r: AggMetrics = {

      tasks: list.length,

      planned: 0,

      actual: 0,

      ai: 0,

      manual: 0,

      saved: 0,

      plannedApp: 0,

      completed: 0,

      aiTasks: 0,

      aiSaved: 0,

      aiPlannedApp: 0,

      toolCounts: {},

      sumPct: 0,

      nPct: 0,

      avgSavings: 0,

      efficiency: 0,

      completionRate: 0,

      adoption: 0,

      topTool: '—',

      topCount: 0,

      toolsUsed: [],

      variance: 0

    };



    list.forEach(e => {

      const c = this.calc(e);

      r.planned += c.planned;

      r.actual += c.actual;

      r.ai += c.ai;

      r.manual += c.manual;

      r.saved += c.saved;

      if (c.applicable) {

        r.plannedApp += c.planned;

        r.sumPct += c.savingsPct;

        r.nPct++;

      }

      if (e.status === 'Completed') r.completed++;

      if (this.isAI(e)) {

        r.aiTasks++;

        r.toolCounts[e.tool] = (r.toolCounts[e.tool] || 0) + 1;

        if (c.applicable) {

          r.aiSaved += c.saved;

          r.aiPlannedApp += c.planned;

        }

      }

    });



    r.avgSavings = r.nPct ? (r.sumPct / r.nPct) : 0;

    r.efficiency = this.safePct(r.saved, r.plannedApp);

    r.completionRate = this.safePct(r.completed, r.tasks);

    r.adoption = this.safePct(r.aiTasks, r.tasks);



    const top = Object.entries(r.toolCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

    r.topTool = top ? top[0] : '—';

    r.topCount = top ? top[1] : 0;

    r.toolsUsed = Object.keys(r.toolCounts);

    r.variance = r.actual - r.planned;

    return r;

  }



  getPeriodRange(period: string): { start: string; end: string; label: string; period: string } {

    const now = new Date();

    const y = now.getFullYear();

    const m = now.getMonth();

    const d = now.getDate();



    if (period === 'Current Week') {

      const dayOfWeek = (now.getDay() + 6) % 7; // 0 for Mon, 6 for Sun

      const mon = new Date(y, m, d - dayOfWeek);

      const sun = new Date(y, m, d - dayOfWeek + 6);

      const start = this.iso(mon);

      const end = this.iso(sun);

      return {

        start,

        end,

        label: `Current Week (${this.fDate(start)} – ${this.fDate(end)})`,

        period: 'Current Week'

      };

    } else if (period === 'Last Week') {

      const dayOfWeek = (now.getDay() + 6) % 7;

      const lastMon = new Date(y, m, d - dayOfWeek - 7);

      const lastSun = new Date(y, m, d - dayOfWeek - 1);

      const start = this.iso(lastMon);

      const end = this.iso(lastSun);

      return {

        start,

        end,

        label: `Last Week (${this.fDate(start)} – ${this.fDate(end)})`,

        period: 'Last Week'

      };

    } else if (period === 'Last Month') {

      const startDt = new Date(y, m - 1, 1);

      const endDt = new Date(y, m, 0);

      const start = this.iso(startDt);

      const end = this.iso(endDt);

      return {

        start,

        end,

        label: `Last Month (${this.mLong(start.slice(0, 7))})`,

        period: 'Last Month'

      };

    } else { // 'Current Month' (default)

      const startDt = new Date(y, m, 1);

      const endDt = new Date(y, m + 1, 0);

      const start = this.iso(startDt);

      const end = this.iso(endDt);

      return {

        start,

        end,

        label: `Current Month (${this.mLong(start.slice(0, 7))})`,

        period: 'Current Month'

      };

    }

  }



  filterByPeriod(entries: TimesheetEntry[], period: string): TimesheetEntry[] {

    const { start, end } = this.getPeriodRange(period);

    return entries.filter(e => e.date >= start && e.date <= end);

  }



  workDaysInPeriod(period: string): string[] {

    const { start, end } = this.getPeriodRange(period);

    const s = this.parse(start);

    const e = this.parse(end);

    const out: string[] = [];

    const cur = new Date(s);

    while (cur <= e) {

      if (this.iso(cur) > this.TODAY) break;

      const w = cur.getDay();

      if (w > 0 && w < 6) {

        out.push(this.iso(cur));

      }

      cur.setDate(cur.getDate() + 1);

    }

    if (out.length === 0) {

      const cur2 = new Date(s);

      while (cur2 <= e) {

        const w = cur2.getDay();

        if (w > 0 && w < 6) out.push(this.iso(cur2));

        cur2.setDate(cur2.getDate() + 1);

      }

    }

    return out;

  }



  subStatus(empId: string, mkOrPeriod: string, entries: TimesheetEntry[]): SubStatus {

    const isPeriod = ['Current Week', 'Last Week', 'Current Month', 'Last Month'].includes(mkOrPeriod);

    const wdList = isPeriod ? this.workDaysInPeriod(mkOrPeriod) : this.workDays(mkOrPeriod);



    let all: TimesheetEntry[];

    if (isPeriod) {

      const { start, end } = this.getPeriodRange(mkOrPeriod);

      all = entries.filter(e => e.empId === empId && e.date >= start && e.date <= end);

    } else {

      all = entries.filter(e => e.empId === empId && e.month === mkOrPeriod);

    }



    const val = all.filter(e => !e._dup && !e._inc);

    const sub = val.filter(e => e.state === 'Submitted');

    const drafts = val.filter(e => e.state === 'Draft');



    const filled = new Set(sub.map(e => e.date));

    const draftDates = new Set(drafts.map(e => e.date));

    const covered = wdList.filter(d => filled.has(d)).length;

    const status = !sub.length ? 'Not Submitted' : (covered >= wdList.length ? 'Submitted' : 'Partially Submitted');

    const last = sub.reduce((m, e) => (e.submittedAt || '') > m ? (e.submittedAt || '') : m, '');



    return {

      status,

      wd: wdList.length,

      covered,

      coverage: this.safePct(covered, wdList.length),

      entries: sub.length,

      drafts: drafts.length,

      excluded: all.length - val.length,

      last,

      filled,

      draftDates,

      wdList,

      missing: Math.max(0, wdList.length - covered)

    };

  }

}

