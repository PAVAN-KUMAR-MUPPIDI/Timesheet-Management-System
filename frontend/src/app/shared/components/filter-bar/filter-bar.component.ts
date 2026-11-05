import { Component, Input, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService } from '../../../core/services/calculation.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filters">
      <label class="ctl">
        Month
        <select [value]="ui().month" (change)="onMonthChange($any($event.target).value)">
          <option *ngFor="let m of availableMonths()" [value]="m" [selected]="ui().month === m">
            {{ calcService.mLong(m) }} ({{ m }})
          </option>
        </select>
      </label>

      <label class="ctl" *ngIf="!noTeam">
        Team
        <select [value]="ui().mTeam" (change)="onTeamChange($any($event.target).value)">
          <option value="all" [selected]="ui().mTeam === 'all'">All teams</option>
          <option *ngFor="let t of teams()" [value]="t" [selected]="ui().mTeam === t">{{ t }}</option>
        </select>
      </label>

      <label class="ctl" *ngIf="!noEmp">
        Employee
        <select [value]="ui().mEmp" (change)="onEmpChange($any($event.target).value)">
          <option value="all" [selected]="ui().mEmp === 'all'">All employees</option>
          <option *ngFor="let e of filteredEmployees()" [value]="e.id" [selected]="ui().mEmp === e.id">
            {{ e.name }} ({{ e.designation }})
          </option>
        </select>
      </label>

      <div class="sp"></div>
      <ng-content></ng-content>
    </div>
  `
})
export class FilterBarComponent implements OnInit {
  @Input() noEmp: boolean = false;
  @Input() noTeam: boolean = false;

  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);
  teams = this.dataService.teams;

  ui = this.dataService.ui;
  availableMonths = this.dataService.availableMonths;

  filteredEmployees = computed(() => {
    const t = this.ui().mTeam;
    const emps = this.dataService.employees();
    return t === 'all' ? emps : emps.filter(e => e.team === t);
  });

  ngOnInit(): void {
    this.dataService.loadControlledConfig();
    this.dataService.loadEmployeesFromBackend();
  }

  onMonthChange(m: string): void {
    if (m) {
      this.dataService.updateUI({ month: m, editId: null });
    }
  }

  onTeamChange(t: string): void {
    if (!t) return;
    const emps = this.dataService.employees();
    const currentEmp = emps.find(e => e.id === this.ui().mEmp);
    let newEmp = this.ui().mEmp;
    if (t !== 'all' && currentEmp && currentEmp.team && currentEmp.team !== t) {
      newEmp = 'all';
    }
    this.dataService.updateUI({ mTeam: t, mEmp: newEmp });
  }

  onEmpChange(id: string): void {
    if (id !== undefined && id !== null) {
      this.dataService.updateUI({ mEmp: id });
    }
  }
}
