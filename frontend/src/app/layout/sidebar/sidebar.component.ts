import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DataProviderService } from '../../core/services/data-provider.service';
import { AuthService } from '../../core/services/auth.service';

export interface NavItem {
  key: string;
  label: string;
  route: string;
  iconPath: string;
}

const NAV_ITEMS: { [role: string]: NavItem[] } = {
  employee: [
    { key: 'dash', label: 'Dashboard', route: '/employee/dashboard', iconPath: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
    { key: 'ts', label: 'My Timesheet', route: '/employee/timesheet', iconPath: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
    { key: 'prod', label: 'My Productivity', route: '/employee/productivity', iconPath: 'M3 17l6-6 4 4 8-8M14 7h7v7' },
    { key: 'ai', label: 'AI Usage', route: '/employee/ai-usage', iconPath: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z' },
    { key: 'hist', label: 'Submission History', route: '/employee/submission-history', iconPath: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3' }
  ],
  manager: [
    { key: 'tdash', label: 'Team Dashboard', route: '/manager/team-dashboard', iconPath: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
    { key: 'eprod', label: 'Employee Productivity', route: '/manager/employee-productivity', iconPath: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    { key: 'tools', label: 'AI Tools Analysis', route: '/manager/ai-tools', iconPath: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z' },
    { key: 'status', label: 'Timesheet Status', route: '/manager/timesheet-status', iconPath: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
    { key: 'import-ts', label: 'Import Timesheets', route: '/manager/import-timesheets', iconPath: 'M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
    { key: 'adopt', label: 'Employee Adoption', route: '/manager/employee-adoption', iconPath: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { key: 'add-emp', label: 'Add Employee', route: '#', iconPath: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6' },
    { key: 'reports', label: 'Reports', route: '/manager/reports', iconPath: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2' }
  ]
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside [class.open]="isOpen">
      <div class="brand">
        <div class="logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">
            <path d="M4 19V10M10 19V5M16 19v-7M22 19H2"/>
          </svg>
        </div>
        <div>Productivity Hub<small>Timesheets · AI Adoption</small></div>
      </div>

      <div class="nav-sec">{{ role() === 'employee' ? 'Employee' : 'Manager' }}</div>
      
      <nav>
        <ng-container *ngFor="let item of navItems">
          <a
            *ngIf="item.key !== 'add-emp'"
            [routerLink]="item.route"
            routerLinkActive="active"
            (click)="closeDrawer()"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path [attr.d]="item.iconPath"/>
            </svg>
            <span>{{ item.label }}</span>
          </a>

          <a
            *ngIf="item.key === 'add-emp'"
            href="#"
            (click)="onAddEmployeeClick($event)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path [attr.d]="item.iconPath"/>
            </svg>
            <span>{{ item.label }}</span>
          </a>
        </ng-container>
      </nav>
    </aside>
  `,
  styles: [`
    aside {
      width: 248px; background: var(--side); color: var(--sideink); flex-shrink: 0;
      position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; z-index: 40; transition: transform .2s;
    }
    .brand { display: flex; align-items: center; gap: 10px; padding: 20px 20px 16px; color: #fff; font-weight: 700; font-size: 16px; }
    .brand .logo { width: 34px; height: 34px; border-radius: 99px; background: linear-gradient(135deg,#5b8cff,#3b6fe0 60%,#14b8a6); display: grid; place-items: center; }
    .brand small { display: block; font-weight: 500; font-size: 11px; color: var(--sideink); letter-spacing: .02em; }
    .nav-sec { padding: 14px 20px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #7f8bb0; font-weight: 600; }
    nav a { display: flex; align-items: center; gap: 11px; margin: 2px 10px; padding: 9px 12px; border-radius: 8px; color: var(--sideink); text-decoration: none; font-weight: 500; cursor: pointer; }
    nav a:hover { background: var(--side2); color: #fff; }
    nav a.active { background: var(--brand); color: #fff; }
    nav svg { width: 18px; height: 18px; flex-shrink: 0; }
    @media (max-width: 1024px) {
      aside { position: fixed; left: 0; top: 0; transform: translateX(-100%); }
      aside.open { transform: none; box-shadow: 0 0 40px rgba(0,0,0,.3); }
    }
  `]
})
export class SidebarComponent {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  dataService = inject(DataProviderService);
  authService = inject(AuthService);
  router = inject(Router);

  ui = this.dataService.ui;
  role = () => this.authService.userRole();

  get navItems(): NavItem[] {
    return NAV_ITEMS[this.role()] || NAV_ITEMS['employee'];
  }

  closeDrawer(): void {
    this.close.emit();
  }

  onAddEmployeeClick(event: Event): void {
    event.preventDefault();
    this.dataService.showAddEmployeeModal.set(true);
    this.closeDrawer();
  }
}
