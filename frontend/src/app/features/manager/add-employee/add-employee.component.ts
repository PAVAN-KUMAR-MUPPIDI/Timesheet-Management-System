import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { AuthService } from '../../../core/services/auth.service';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ColumnDef } from '../../../core/services/export.service';

@Component({
  selector: 'app-add-employee',
  standalone: true,
  imports: [CommonModule, FormsModule, DataTableComponent],
  template: `
    <div class="page-h">
      <div>
        <h2>Add Employee</h2>
        <p>Create a new employee account and grant portal access for timesheet submission</p>
      </div>
    </div>

    <!-- Success Alert Banner -->
    <div class="banner ok" *ngIf="successMessage">
      <div style="font-size:22px">🟢</div>
      <div>
        <div class="t">Employee Account Created Successfully!</div>
        <div class="d">{{ successMessage }}</div>
      </div>
      <div class="sp"></div>
      <button class="btn sm ghost" (click)="successMessage = ''">Dismiss</button>
    </div>

    <!-- Error Banner -->
    <div class="banner bad" *ngIf="errorMessage">
      <div style="font-size:22px">⚠️</div>
      <div>
        <div class="t">Validation Error</div>
        <div class="d">{{ errorMessage }}</div>
      </div>
      <div class="sp"></div>
      <button class="btn sm ghost" (click)="errorMessage = ''">Dismiss</button>
    </div>

    <div class="grid g32">
      <!-- Employee Creation Form -->
      <div class="card">
        <div class="card-h">
          <h3>Employee Details</h3>
          <span class="sub">Fill in employee information below (all fields marked with * are required)</span>
        </div>

        <form (ngSubmit)="onSubmit()" novalidate>
          <div class="fgrid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
            <div class="f s2">
              <label for="empName">Full Name Pav<em>*</em></label>
              <input
                id="empName"
                type="text"
                [(ngModel)]="name"
                (ngModelChange)="onNameChange()"
                (blur)="touchedName = true"
                name="name"
                placeholder="e.g. name surname"
                required
                [class.input-err]="touchedName && !isNameValid()"
              />
              <span class="field-err" *ngIf="touchedName && !isNameValid()">
                {{ getNameErrorMessage() }}
              </span>
            </div>

            <div class="f s2">
              <label for="empEmail">Company Email <em>*</em></label>
              <input
                id="empEmail"
                type="email"
                [(ngModel)]="email"
                name="email"
                placeholder="e.g. name.surname@company.com"
                required
                (blur)="touchedEmail = true"
                [class.input-err]="touchedEmail && !isEmailValid()"
              />
              <span class="field-err" *ngIf="touchedEmail && !isEmailValid()">
                {{ getEmailErrorMessage() }}
              </span>
            </div>

            <div class="f">
              <label for="empTeam">Assigned Team <em>*</em></label>
              <select
                id="empTeam"
                [(ngModel)]="team"
                name="team"
                required
                (blur)="touchedTeam = true"
                [class.input-err]="touchedTeam && !isTeamValid()"
              >
                <option value="" disabled>-- Select Assigned Team --</option>
                <option *ngFor="let t of availableTeams()" [value]="t">{{ t }}</option>
              </select>
              <span class="field-err" *ngIf="touchedTeam && !isTeamValid()">
                {{ getTeamErrorMessage() }}
              </span>
            </div>

            <div class="f">
              <label for="empDesignation">Designation <em>*</em></label>
              <input
                id="empDesignation"
                type="text"
                [(ngModel)]="designation"
                name="designation"
                placeholder="e.g. Frontend Developer"
                required
                (blur)="touchedDesignation = true"
                [class.input-err]="touchedDesignation && !isDesignationValid()"
              />
              <span class="field-err" *ngIf="touchedDesignation && !isDesignationValid()">
                {{ getDesignationErrorMessage() }}
              </span>
            </div>

            <div class="f s2">
              <label for="empPassword">
                Default Password <em>*</em>
                <span class="label-hint">(matches login password criteria)</span>
              </label>
              <div class="pwd-input-wrap">
                <input
                  id="empPassword"
                  [type]="showPassword ? 'text' : 'password'"
                  [(ngModel)]="password"
                  (input)="onPasswordInput()"
                  (blur)="touchedPassword = true"
                  name="password"
                  placeholder="Default: name@1234"
                  style="padding-right: 42px;"
                  [class.input-err]="touchedPassword && !isPasswordValid()"
                />
                <button
                  type="button"
                  class="eye-btn"
                  (click)="togglePassword()"
                  [title]="showPassword ? 'Hide password' : 'Show password'"
                  [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
                  <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                </button>
              </div>

              <!-- Password hints badges -->
              <div class="pwd-hints">
                <span [class.valid]="hasMinLength()">Min 8 chars</span>
                <span [class.valid]="hasAlphabet()">Alphabets</span>
                <span [class.valid]="hasDigit()">Digits</span>
                <span [class.valid]="hasSymbol()">Symbols</span>
              </div>

              <span class="field-err" *ngIf="touchedPassword && !isPasswordValid()">
                {{ getPasswordErrorMessage() }}
              </span>
            </div>
          </div>

          <div class="form-actions" style="margin-top: 20px;">
            <button type="submit" class="btn" [disabled]="isSubmitting">
              <span *ngIf="!isSubmitting">+ Create Employee Account</span>
              <span *ngIf="isSubmitting">Creating Account...</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Quick Info / Help Card -->
      <div class="card" style="align-self: start;">
        <div class="card-h">
          <h3>Account Credentials</h3>
        </div>
        <p style="color:var(--muted); font-size:13px; line-height:1.5;">
          Once created, the employee can immediately sign in to the portal using their company email and assigned password.
        </p>
        <div style="background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px; margin-top:12px; font-size:12.5px;">
          <div><strong>Default Password:</strong> <code>name&#64;1234</code> (e.g. <code>{{ computedDefaultPassword() }}</code>)</div>
          <div style="margin-top:6px; color:var(--muted);">Meets all security requirements: 8+ characters, letters, digits, and symbol.</div>
        </div>
      </div>
    </div>

    <!-- Roster Table of All Active Employees -->
    <div class="card" style="margin-top: 16px;">
      <app-data-table
        title="Employee Roster"
        sub="All active employees registered in Productivity Hub"
        [cols]="tableCols"
        [rows]="dataService.employees()"
      ></app-data-table>
    </div>
  `,
  styles: [`
    .pwd-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    .eye-btn {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      color: #64748b;
      border-radius: 6px;
      transition: color .15s, background-color .15s;
    }
    .eye-btn:hover {
      color: #0f172a;
      background: #f1f5f9;
    }
    .pwd-hints {
      display: flex;
      gap: 6px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .pwd-hints span {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #64748b;
      font-weight: 600;
      border: 1px solid #e2e8f0;
      transition: all 0.2s ease;
    }
    .pwd-hints span.valid {
      background: #ecfdf5;
      color: #059669;
      border-color: #a7f3d0;
    }
    .field-err {
      color: #dc2626;
      font-size: 11.5px;
      margin-top: 3px;
      font-weight: 500;
      display: block;
    }
    .label-hint {
      font-weight: 400;
      color: #64748b;
      font-size: 11px;
      margin-left: 4px;
    }
    .input-err {
      border-color: #ef4444 !important;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
    }
  `]
})
export class AddEmployeeComponent implements OnInit {
  dataService = inject(DataProviderService);
  authService = inject(AuthService);
  router = inject(Router);

  name = '';
  email = '';
  team = 'Frontend';
  designation = 'Developer';
  password = 'name@1234';

  userCustomizedPassword = false;
  showPassword = false;
  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  touchedName = false;
  touchedEmail = false;
  touchedTeam = false;
  touchedDesignation = false;
  touchedPassword = false;

  availableTeams = this.dataService.teams;

  readonly emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  tableCols: ColumnDef[] = [
    { k: 'id', l: 'Employee ID' },
    { k: 'name', l: 'Full Name' },
    { k: 'email', l: 'Email Address' },
    { k: 'team', l: 'Team' },
    { k: 'designation', l: 'Designation' }
  ];

  ngOnInit(): void {
    this.dataService.loadControlledConfig();
    this.dataService.loadEmployeesFromBackend();
    const tms = this.availableTeams();
    if (tms && tms.length > 0 && !this.team) {
      this.team = tms[0];
    }
  }

  computedDefaultPassword(): string {
    const clean = this.name.trim();
    if (!clean) return 'name@1234';
    const firstWord = clean.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${firstWord || 'name'}@1234`;
  }

  onNameChange(): void {
    if (!this.userCustomizedPassword) {
      this.password = this.computedDefaultPassword();
    }
  }

  onPasswordInput(): void {
    this.userCustomizedPassword = true;
    this.touchedPassword = true;
    this.errorMessage = '';
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  hasMinLength(): boolean {
    return (this.password || '').length >= 8;
  }

  hasAlphabet(): boolean {
    return /[a-zA-Z]/.test(this.password || '');
  }

  hasDigit(): boolean {
    return /[0-9]/.test(this.password || '');
  }

  hasSymbol(): boolean {
    return /[^a-zA-Z0-9\s]/.test(this.password || '');
  }

  isPasswordValid(): boolean {
    return this.hasMinLength() && this.hasAlphabet() && this.hasDigit() && this.hasSymbol();
  }

  getPasswordErrorMessage(): string {
    if (!this.password) {
      return 'Password is required.';
    }
    if (!this.hasMinLength()) {
      return 'Password must be at least 8 characters long.';
    }
    if (!this.hasAlphabet()) {
      return 'Password must include at least one letter (a-z, A-Z).';
    }
    if (!this.hasDigit()) {
      return 'Password must include at least one digit (0-9).';
    }
    if (!this.hasSymbol()) {
      return 'Password must include at least one symbol (e.g. @, #, $, !).';
    }
    return '';
  }

  isNameValid(): boolean {
    return !!this.name && this.name.trim().length >= 2;
  }

  getNameErrorMessage(): string {
    if (!this.name || !this.name.trim()) {
      return 'Full Name is required.';
    }
    if (this.name.trim().length < 2) {
      return 'Full Name must be at least 2 characters.';
    }
    return '';
  }

  isTeamValid(): boolean {
    return !!this.team && this.team.trim().length > 0;
  }

  getTeamErrorMessage(): string {
    if (!this.team || !this.team.trim()) {
      return 'Assigned Team is required.';
    }
    return '';
  }

  isDesignationValid(): boolean {
    return !!this.designation && this.designation.trim().length >= 2;
  }

  getDesignationErrorMessage(): string {
    if (!this.designation || !this.designation.trim()) {
      return 'Designation is required.';
    }
    if (this.designation.trim().length < 2) {
      return 'Designation must be at least 2 characters.';
    }
    return '';
  }

  isEmailValid(): boolean {
    if (!this.email || !this.email.trim()) return false;
    const clean = this.email.trim().toLowerCase();
    if (!this.emailRegex.test(clean)) return false;
    const exists = this.dataService.employees().some(e => (e.email || '').toLowerCase() === clean);
    return !exists;
  }

  getEmailErrorMessage(): string {
    if (!this.email || !this.email.trim()) {
      return 'Company Email address is required.';
    }
    const clean = this.email.trim().toLowerCase();
    if (!this.emailRegex.test(clean)) {
      return 'Please enter a valid company email address (e.g. name@company.com).';
    }
    const exists = this.dataService.employees().some(e => (e.email || '').toLowerCase() === clean);
    if (exists) {
      return 'An employee with this email already exists.';
    }
    return '';
  }

  onSubmit(): void {
    this.touchedName = true;
    this.touchedEmail = true;
    this.touchedTeam = true;
    this.touchedDesignation = true;
    this.touchedPassword = true;

    if (!this.isNameValid()) {
      this.errorMessage = this.getNameErrorMessage();
      return;
    }

    if (!this.isEmailValid()) {
      this.errorMessage = this.getEmailErrorMessage();
      return;
    }

    if (!this.isTeamValid()) {
      this.errorMessage = this.getTeamErrorMessage();
      return;
    }

    if (!this.isDesignationValid()) {
      this.errorMessage = this.getDesignationErrorMessage();
      return;
    }

    if (!this.isPasswordValid()) {
      this.errorMessage = this.getPasswordErrorMessage() || 'Password must meet all security requirements.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const effectivePassword = this.password.trim() || this.computedDefaultPassword();

    const newEmp = this.dataService.addEmployee({
      name: this.name.trim(),
      email: this.email.trim().toLowerCase(),
      team: this.team,
      designation: this.designation.trim(),
      password: effectivePassword
    });

    this.isSubmitting = false;
    this.successMessage = `Account created for ${newEmp.name} (ID: ${newEmp.id}). Login Email: ${newEmp.email} | Password: ${effectivePassword}`;

    // Reset Form
    this.name = '';
    this.email = '';
    this.team = this.availableTeams()[0] || 'Frontend';
    this.designation = 'Developer';
    this.password = 'name@1234';
    this.userCustomizedPassword = false;
    this.touchedName = false;
    this.touchedEmail = false;
    this.touchedTeam = false;
    this.touchedDesignation = false;
    this.touchedPassword = false;
  }
}
