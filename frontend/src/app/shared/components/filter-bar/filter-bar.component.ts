import { Component, Input, OnInit, inject } from '@angular/core';
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
        <select [ngModel]="ui().month" (ngModelChange)="onMonthChange($event)">
          <option *ngFor="let m of availableMonths()" [value]="m">{{ calcService.mLong(m) }} ({{ m }})</option>
        </select>
      </label>

      <label class="ctl" *ngIf="!noTeam">
        Team
        <select [ngModel]="ui().mTeam" (ngModelChange)="onTeamChange($event)">
          <option value="all">All teams</option>
          <option *ngFor="let t of teams()" [value]="t">{{ t }}</option>
        </select>
      </label>

      <label class="ctl" *ngIf="!noEmp">
        Employee
        <select [ngModel]="ui().mEmp" (ngModelChange)="onEmpChange($event)">
          <option value="all">All employees</option>
          <option *ngFor="let e of filteredEmployees()" [value]="e.id">{{ e.name }} ({{ e.designation }})</option>
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

  ngOnInit(): void {
    this.dataService.loadControlledConfig();
    this.dataService.loadEmployeesFromBackend();
  }

  filteredEmployees() {
    const t = this.ui().mTeam;
    const emps = this.dataService.employees();
    return t === 'all' ? emps : emps.filter(e => e.team === t);
  }

  onMonthChange(m: string) {
    this.dataService.updateUI({ month: m, editId: null });
  }

  onTeamChange(t: string) {
    const currentEmp = this.dataService.employees().find(e => e.id === this.ui().mEmp);
    let newEmp = this.ui().mEmp;
    if (t !== 'all' && currentEmp && currentEmp.team !== t) {
      newEmp = 'all';
    }
    this.dataService.updateUI({ mTeam: t, mEmp: newEmp });
  }

  onEmpChange(id: string) {
    this.dataService.updateUI({ mEmp: id });
  }
}
