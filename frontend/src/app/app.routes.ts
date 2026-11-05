import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AppLayoutComponent } from './layout/app-layout/app-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { AuthService } from './core/services/auth.service';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => {
          const auth = inject(AuthService);
          return auth.userRole() === 'manager' ? 'manager/team-dashboard' : 'employee/dashboard';
        }
      },
      
      // Employee Feature Routes (Guarded for Employee Role)
      {
        path: 'employee/dashboard',
        canActivate: [roleGuard],
        data: { roles: ['employee'] },
        loadComponent: () => import('./features/employee/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'employee/timesheet',
        canActivate: [roleGuard],
        data: { roles: ['employee'] },
        loadComponent: () => import('./features/employee/timesheet/timesheet.component').then(m => m.TimesheetComponent)
      },
      {
        path: 'employee/productivity',
        canActivate: [roleGuard],
        data: { roles: ['employee'] },
        loadComponent: () => import('./features/employee/productivity/productivity.component').then(m => m.ProductivityComponent)
      },
      {
        path: 'employee/ai-usage',
        canActivate: [roleGuard],
        data: { roles: ['employee'] },
        loadComponent: () => import('./features/employee/ai-usage/ai-usage.component').then(m => m.AiUsageComponent)
      },
      {
        path: 'employee/submission-history',
        canActivate: [roleGuard],
        data: { roles: ['employee'] },
        loadComponent: () => import('./features/employee/submission-history/submission-history.component').then(m => m.SubmissionHistoryComponent)
      },

      // Manager Feature Routes (Guarded for Manager Role)
      {
        path: 'manager/team-dashboard',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/team-dashboard/team-dashboard.component').then(m => m.TeamDashboardComponent)
      },
      {
        path: 'manager/employee-productivity',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/employee-productivity/employee-productivity.component').then(m => m.EmployeeProductivityComponent)
      },
      {
        path: 'manager/ai-tools',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/ai-tools/ai-tools.component').then(m => m.AiToolsComponent)
      },
      {
        path: 'manager/timesheet-status',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/timesheet-status/timesheet-status.component').then(m => m.TimesheetStatusComponent)
      },
      {
        path: 'manager/employee-adoption',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/employee-adoption/employee-adoption.component').then(m => m.EmployeeAdoptionComponent)
      },
      {
        path: 'manager/add-employee',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/add-employee/add-employee.component').then(m => m.AddEmployeeComponent)
      },
      {
        path: 'manager/reports',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'manager/import-timesheets',
        canActivate: [roleGuard],
        data: { roles: ['manager'] },
        loadComponent: () => import('./features/manager/import-timesheets/import-timesheets.component').then(m => m.ImportTimesheetsComponent)
      },
      {
        path: '404',
        loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent)
      }
    ]
  },
  {
    path: '404',
    loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent)
  },
  {
    path: '**',
    redirectTo: () => {
      const auth = inject(AuthService);
      return auth.isLoggedIn() ? '404' : 'login';
    }
  }
];
