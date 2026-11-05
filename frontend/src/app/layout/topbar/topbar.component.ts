import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataProviderService } from '../../core/services/data-provider.service';
import { CalculationService } from '../../core/services/calculation.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="topbar">
      <button class="menu-btn" (click)="toggleMenu.emit()" aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
      </button>

      <h1 id="pageTitle">{{ pageTitle }}</h1>
      <div class="sp"></div>

      <!-- User Profile Badge & Logout -->
      <div class="user-profile" *ngIf="authService.currentUser() as user" (click)="openProfileModal($event)" title="Click to view/edit profile & change password">
        <div class="avatar-badge">{{ calcService.initials(user.name) }}</div>
        <div class="user-meta">
          <span class="user-name">{{ user.name }}</span>
          <span class="user-role">{{ user.designation }}</span>
        </div>
        <button class="logout-btn" (click)="onLogout($event)" title="Sign Out of Application" aria-label="Sign Out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span class="logout-text">Logout</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      position: sticky; top: 0; z-index: 30; background: rgba(255,255,255,.92);
      backdrop-filter: blur(8px); border-bottom: 1px solid var(--line);
      display: flex; align-items: center; gap: 16px; padding: 12px 24px; flex-wrap: wrap;
    }
    .topbar h1 { font-size: 17px; margin: 0; font-weight: 600; }
    .sp { flex: 1; }
    .menu-btn { display: none; border: 1px solid var(--line); background: #fff; border-radius: 8px; width: 36px; height: 36px; cursor: pointer; place-items: center; }
    .ctl { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
    .ctl select { padding: 6px 10px; border-radius: 7px; border: 1px solid var(--line); font-size: 13px; background: #fff; color: #0f172a; }
    
    .user-profile {
      display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 6px;
      background: var(--soft, #f8fafc); border: 1px solid var(--line, #e2e8f0);
      border-radius: 10px; cursor: pointer; transition: all .15s ease;
    }
    .user-profile:hover {
      background: #eff6ff; border-color: #3b6fe0;
    }
    .avatar-badge {
      width: 32px; height: 32px; border-radius: 50%;
      background: linear-gradient(135deg, #3b6fe0, #2563eb);
      color: #ffffff; display: grid; place-items: center;
      font-weight: 600; font-size: 12px; flex-shrink: 0;
    }
    .user-meta { display: flex; flex-direction: column; line-height: 1.25; }
    .user-name { font-weight: 600; font-size: 13px; color: #0f172a; }
    .user-role { font-size: 11px; color: var(--muted, #64748b); font-weight: 500; }
    
    .logout-btn {
      background: #ffffff;
      border: 1.5px solid #fecaca;
      color: #dc2626;
      height: 30px;
      padding: 0 10px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
      transition: all .2s ease;
      box-shadow: 0 1px 3px rgba(239, 68, 68, 0.08);
    }
    .logout-btn:hover {
      background: #fef2f2;
      border-color: #ef4444;
      color: #b91c1c;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.16);
      transform: translateY(-1px);
    }
    .logout-text {
      font-size: 12px;
      font-weight: 600;
    }

    @media (max-width: 1024px) {
      .menu-btn { display: grid; }
      .topbar { padding: 10px 16px; }
      .user-meta { display: none; }
    }
  `]
})
export class TopbarComponent {
  @Output() toggleMenu = new EventEmitter<void>();

  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);
  authService = inject(AuthService);
  router = inject(Router);

  ui = this.dataService.ui;

  get pageTitle(): string {
    const url = this.router.url;
    if (url.includes('dashboard')) return url.includes('team') ? 'Team Dashboard' : 'Dashboard';
    if (url.includes('timesheet-status')) return 'Timesheet Status';
    if (url.includes('timesheet')) return 'My Timesheet';
    if (url.includes('employee-productivity')) return 'Employee Productivity';
    if (url.includes('productivity')) return 'My Productivity';
    if (url.includes('ai-tools')) return 'AI Tools Analysis';
    if (url.includes('ai-usage')) return 'AI Usage';
    if (url.includes('submission-history')) return 'Submission History';
    if (url.includes('employee-adoption')) return 'Employee Adoption';
    if (url.includes('reports')) return 'Reports';
    return 'Productivity Hub';
  }

  openProfileModal(event: MouseEvent): void {
    this.dataService.showUserProfileModal.set(true);
  }

  onLogout(event: MouseEvent): void {
    event.stopPropagation();
    this.authService.logout();
  }
}
