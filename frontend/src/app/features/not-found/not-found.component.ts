import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="nf-container">
      <div class="nf-card">
        <div class="nf-badge">404 ERROR</div>
        <div class="nf-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m4.93 4.93 14.14 14.14"></path>
          </svg>
        </div>
        <h2>Page Not Found</h2>
        <p class="nf-desc">
          The page you are looking for does not exist, was removed, or is temporarily unavailable.
        </p>

        <div class="nf-actions">
          <button class="btn" (click)="goToDashboard()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
              <rect width="7" height="9" x="3" y="3" rx="1"></rect>
              <rect width="7" height="5" x="14" y="3" rx="1"></rect>
              <rect width="7" height="9" x="14" y="12" rx="1"></rect>
              <rect width="7" height="5" x="3" y="16" rx="1"></rect>
            </svg>
            Back to Dashboard
          </button>
          <button class="btn ghost" (click)="goBack()">
            ← Go Back
          </button>
        </div>

        <div class="nf-footer" *ngIf="userRole">
          <span class="sub">Logged in as <b>{{ userRole | titlecase }}</b></span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .nf-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 70vh;
      padding: 32px 16px;
    }
    .nf-card {
      background: var(--card-bg, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 16px;
      padding: 48px 36px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
    }
    .nf-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 999px;
      background: #fee2e2;
      color: #ef4444;
      margin-bottom: 20px;
    }
    .nf-icon {
      color: #94a3b8;
      margin-bottom: 16px;
      display: flex;
      justify-content: center;
    }
    .nf-card h2 {
      font-size: 26px;
      font-weight: 700;
      color: var(--ink, #0f172a);
      margin: 0 0 10px;
    }
    .nf-desc {
      font-size: 14px;
      color: var(--muted, #64748b);
      margin: 0 0 28px;
      line-height: 1.6;
    }
    .nf-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .nf-footer {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid var(--border, #e2e8f0);
    }
    .nf-footer .sub {
      font-size: 13px;
      color: var(--muted, #64748b);
    }
  `]
})
export class NotFoundComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  get userRole(): string | undefined {
    return this.authService.currentUser()?.role;
  }

  goToDashboard(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    const role = this.userRole;
    if (role === 'manager') {
      this.router.navigate(['/manager/team-dashboard']);
    } else {
      this.router.navigate(['/employee/dashboard']);
    }
  }

  goBack(): void {
    window.history.back();
  }
}
