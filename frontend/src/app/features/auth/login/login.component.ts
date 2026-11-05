import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-container">
        <!-- Brand Header -->
        <div class="brand-header">
          <div class="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
              <path d="M4 19V10M10 19V5M16 19v-7M22 19H2"/>
            </svg>
          </div>
          <h2>Productivity Hub</h2>
          <p>Timesheets & AI Adoption Tracking</p>
        </div>

        <!-- Login Card -->
        <div class="card login-card">
          <h3>Sign in to your account</h3>

          <div *ngIf="errorMessage" class="error-banner">
            <span>⚠️</span> {{ errorMessage }}
          </div>

          <form (ngSubmit)="onSubmit()">
            <div class="field">
              <label for="email">Work Email</label>
              <input
                id="email"
                type="email"
                [(ngModel)]="email"
                name="email"
                placeholder="name@company.com"
                required
                autocomplete="email"
                (blur)="touchedEmail = true"
                (input)="onEmailInput()"
                [class.input-err]="touchedEmail && !isEmailValid()"
              />
              <span class="field-err" *ngIf="touchedEmail && !isEmailValid()">
                {{ getEmailErrorMessage() }}
              </span>
            </div>

            <div class="field">
              <label for="password">Password</label>
              <div class="pwd-input-wrap">
                <input
                  id="password"
                  [type]="showPassword ? 'text' : 'password'"
                  [(ngModel)]="password"
                  name="password"
                  placeholder="Enter your password"
                  required
                  autocomplete="current-password"
                  (blur)="touchedPassword = true"
                  (input)="onPasswordInput()"
                  [class.input-err]="touchedPassword && !isPasswordValid()"
                  style="padding-right: 42px;"
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

            <button type="submit" class="submit-btn" [disabled]="isLoading">
              <span *ngIf="!isLoading">Sign In</span>
              <span *ngIf="isLoading" class="spinner">Authenticating...</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      width: 100%;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
      font-family: inherit;
    }
    .login-container {
      width: 100%;
      max-width: 440px;
    }
    .brand-header {
      text-align: center;
      margin-bottom: 24px;
      color: #fff;
    }
    .brand-header .logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #5b8cff, #3b6fe0 60%, #14b8a6);
      display: grid;
      place-items: center;
      margin: 0 auto 12px;
      box-shadow: 0 8px 20px rgba(59, 111, 224, 0.35);
    }
    .brand-header h2 {
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .brand-header p {
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
    }
    .login-card {
      background: #ffffff;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .login-card h3 {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin: 0 0 20px;
    }
    .error-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #ef4444;
      padding: 10px 14px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .field {
      margin-bottom: 18px;
    }
    .field label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
    }
    .field input {
      width: 100%;
      padding: 11px 14px;
      border-radius: 9px;
      border: 1px solid #cbd5e1;
      font-size: 14px;
      color: #0f172a;
      box-sizing: border-box;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    .field input:focus {
      border-color: #3b6fe0;
      box-shadow: 0 0 0 3px rgba(59, 111, 224, 0.15);
    }
    .field input.input-err {
      border-color: #ef4444 !important;
      background-color: #fffbfa;
    }
    .field input.input-err:focus {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
    }
    .field-err {
      color: #ef4444;
      font-size: 12px;
      margin-top: 5px;
      display: block;
      font-weight: 500;
    }
    .pwd-input-wrap {
      position: relative;
    }
    .pwd-input-wrap input {
      padding-right: 42px;
    }
    .pwd-hints {
      display: flex;
      gap: 6px;
      margin-top: 7px;
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
      background: #dcfce7;
      color: #15803d;
      border-color: #86efac;
    }
    .eye-btn {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: #64748b;
      display: grid;
      place-items: center;
      padding: 4px;
      border-radius: 6px;
      transition: color .15s;
    }
    .eye-btn:hover {
      color: #0f172a;
    }
    .submit-btn {
      width: 100%;
      padding: 12px;
      border-radius: 9px;
      background: linear-gradient(135deg, #3b6fe0, #2563eb);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      margin-top: 10px;
      transition: transform .15s, opacity .15s, box-shadow .15s;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }
    .submit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
    }
    .submit-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .spinner {
      display: inline-block;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
  `]
})
export class LoginComponent implements OnInit {
  authService = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  email = '';
  password = '';
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  touchedEmail = false;
  touchedPassword = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  readonly emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      const role = this.authService.currentUser()?.role;
      this.router.navigate([role === 'manager' ? '/manager/team-dashboard' : '/employee/dashboard']);
    }
  }

  isEmailValid(): boolean {
    if (!this.email) return false;
    return this.emailRegex.test(this.email.trim());
  }

  getEmailErrorMessage(): string {
    if (!this.email || !this.email.trim()) {
      return 'Email address is required.';
    }
    if (!this.isEmailValid()) {
      return 'Please enter a valid work email address (e.g. name@company.com).';
    }
    return '';
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

  onEmailInput(): void {
    this.errorMessage = '';
  }

  onPasswordInput(): void {
    this.errorMessage = '';
  }

  onSubmit(): void {
    this.touchedEmail = true;
    this.touchedPassword = true;

    if (!this.email.trim()) {
      this.errorMessage = 'Work email address is required.';
      return;
    }

    if (!this.isEmailValid()) {
      this.errorMessage = 'Please enter a valid work email address (e.g. name@company.com).';
      return;
    }

    if (!this.password) {
      this.errorMessage = 'Password is required.';
      return;
    }

    if (!this.isPasswordValid()) {
      this.errorMessage = 'Password must be at least 8 characters and include letters, digits, and symbols.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login({ email: this.email.trim(), password: this.password }).subscribe({
      next: (session) => {
        this.isLoading = false;
        const returnUrl = this.route.snapshot.queryParams['returnUrl'];
        if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
        } else if (session.role === 'manager') {
          this.router.navigate(['/manager/team-dashboard']);
        } else {
          this.router.navigate(['/employee/dashboard']);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = typeof err === 'string' ? err : (err?.message || 'Invalid email or password. Please try again.');
      }
    });
  }
}
