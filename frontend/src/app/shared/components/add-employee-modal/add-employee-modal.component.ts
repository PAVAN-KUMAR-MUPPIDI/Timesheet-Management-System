import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataProviderService } from '../../../core/services/data-provider.service';

@Component({
  selector: 'app-add-employee-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" *ngIf="dataService.showAddEmployeeModal()" (click)="onBackdropClick($event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3>👤 Add New Employee Account</h3>
          <button class="close-btn" (click)="closeModal()">&times;</button>
        </div>

        <div class="modal-body">
          <div class="alert ok" *ngIf="successMsg">🟢 {{ successMsg }}</div>
          <div class="alert bad" *ngIf="errorMsg">⚠️ {{ errorMsg }}</div>

          <form (ngSubmit)="onSubmit()" novalidate>
            <div class="fgrid">
              <div class="f">
                <label for="modalEmpName">Full Name <em>*</em></label>
                <input
                  id="modalEmpName"
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

              <div class="f">
                <label for="modalEmpEmail">Company Email <em>*</em></label>
                <input
                  id="modalEmpEmail"
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
                <label for="modalEmpTeam">Assigned Team <em>*</em></label>
                <select
                  id="modalEmpTeam"
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
                <label for="modalEmpDesignation">Designation <em>*</em></label>
                <input
                  id="modalEmpDesignation"
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

              <div class="f full-width">
                <label for="modalEmpPassword">
                  Default Password <em>*</em>
                  <span class="label-hint">(matches login password requirements)</span>
                </label>
                <div class="pwd-input-wrap">
                  <input
                    id="modalEmpPassword"
                    [type]="showPassword ? 'text' : 'password'"
                    [(ngModel)]="password"
                    (input)="onPasswordInput()"
                    (blur)="touchedPassword = true"
                    name="password"
                    placeholder="Default: name@1234"
                    required
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

                <!-- Real-time Password Criteria Badges -->
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

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="isSubmitting">
                <span *ngIf="!isSubmitting">+ Create Account</span>
                <span *ngIf="isSubmitting">Creating...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(6px);
      display: grid; place-items: center; padding: 20px;
      animation: fadeIn .2s ease-out;
    }
    .modal-card {
      background: #ffffff; border-radius: 16px; width: 100%; max-width: 520px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.25); border: 1px solid #e2e8f0;
      overflow: hidden; animation: popIn .25s cubic-bezier(.34, 1.56, .64, 1);
    }
    .modal-header {
      padding: 18px 24px; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
      background: #f8fafc;
    }
    .modal-header h3 { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
    .close-btn { background: transparent; border: none; font-size: 22px; cursor: pointer; color: #64748b; }
    .close-btn:hover { color: #0f172a; }

    .modal-body { padding: 24px; }
    .alert { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; font-weight: 500; }
    .alert.ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
    .alert.bad { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

    .fgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .f { display: flex; flex-direction: column; gap: 5px; }
    .f.full-width { grid-column: span 2; }
    .f label { font-size: 12px; font-weight: 600; color: #475569; em { color: #ef4444; font-style: normal; } }
    .label-hint { font-weight: 400; color: #64748b; font-size: 11px; margin-left: 4px; }
    .f input, .f select {
      padding: 9px 12px; border-radius: 8px; border: 1px solid #cbd5e1;
      font-size: 13.5px; color: #0f172a; outline: none; width: 100%; box-sizing: border-box; background: #fff;
    }
    .f input:focus, .f select:focus { border-color: #3b6fe0; box-shadow: 0 0 0 3px rgba(59, 111, 224, 0.15); }
    .input-err { border-color: #ef4444 !important; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important; }

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

    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
    .btn { padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13.5px; cursor: pointer; border: none; }
    .btn-primary { background: #3b6fe0; color: #fff; box-shadow: 0 4px 12px rgba(59, 111, 224, 0.25); }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #e2e8f0; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes popIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `]
})
export class AddEmployeeModalComponent implements OnInit {
  dataService = inject(DataProviderService);

  name = '';
  email = '';
  team = 'Frontend';
  designation = 'Developer';
  password = 'name@1234';

  userCustomizedPassword = false;
  showPassword = false;
  isSubmitting = false;
  successMsg = '';
  errorMsg = '';

  touchedName = false;
  touchedEmail = false;
  touchedTeam = false;
  touchedDesignation = false;
  touchedPassword = false;

  availableTeams = this.dataService.teams;

  readonly emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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
    this.errorMsg = '';
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

  closeModal(): void {
    this.dataService.showAddEmployeeModal.set(false);
    this.errorMsg = '';
    this.successMsg = '';
    this.touchedName = false;
    this.touchedEmail = false;
    this.touchedTeam = false;
    this.touchedDesignation = false;
    this.touchedPassword = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  onSubmit(): void {
    this.touchedName = true;
    this.touchedEmail = true;
    this.touchedTeam = true;
    this.touchedDesignation = true;
    this.touchedPassword = true;

    if (!this.isNameValid()) {
      this.errorMsg = this.getNameErrorMessage();
      return;
    }

    if (!this.isEmailValid()) {
      this.errorMsg = this.getEmailErrorMessage();
      return;
    }

    if (!this.isTeamValid()) {
      this.errorMsg = this.getTeamErrorMessage();
      return;
    }

    if (!this.isDesignationValid()) {
      this.errorMsg = this.getDesignationErrorMessage();
      return;
    }

    if (!this.isPasswordValid()) {
      this.errorMsg = this.getPasswordErrorMessage() || 'Password must meet all security requirements.';
      return;
    }

    this.isSubmitting = true;
    this.errorMsg = '';
    this.successMsg = '';

    const effectivePassword = this.password.trim() || this.computedDefaultPassword();

    this.dataService.addEmployee({
      name: this.name.trim(),
      email: this.email.trim().toLowerCase(),
      team: this.team,
      designation: this.designation.trim(),
      password: effectivePassword
    }).subscribe({
      next: (newEmp) => {
        this.isSubmitting = false;
        this.successMsg = `Account created for ${newEmp.name} (${newEmp.id})! Login password: ${effectivePassword}`;

        // Reset fields
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

        setTimeout(() => {
          this.closeModal();
        }, 1500);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMsg = err?.error?.detail || err?.message || 'Failed to create employee in database. Please verify inputs and try again.';
      }
    });
  }
}
