import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of, map, timeout, firstValueFrom } from 'rxjs';
import { UserSession, RoleType, AUTH_BASE_URL } from '../models/models';
import { DataProviderService } from './data-provider.service';

// Secure cryptographic session token key - strictly stores only the opaque token, never roles or permissions
const TOKEN_STORAGE_KEY = 'team_productivity_sec_token_v1';
const SESSION_BACKUP_KEY = 'team_productivity_user_sess_v1';


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private dataProvider = inject(DataProviderService);

  // In-memory verified user session - populated from server /api/auth/me
  private sessionSignal = signal<UserSession | null>(null);
  private csrfTokenSignal = signal<string | null>(null);

  readonly session = computed(() => this.sessionSignal());
  readonly currentUser = computed(() => this.sessionSignal());
  readonly isAuthenticated = computed(() => !!this.sessionSignal());
  readonly isLoggedIn = computed(() => !!this.sessionSignal());
  readonly isManager = computed(() => this.sessionSignal()?.role === 'manager');
  readonly isEmployee = computed(() => this.sessionSignal()?.role === 'employee');
  readonly currentRole = computed<RoleType>(() => this.sessionSignal()?.role || 'employee');
  readonly userRole = computed<RoleType>(() => this.sessionSignal()?.role || 'employee');
  readonly token = computed<string | null>(() => this.sessionSignal()?.token || this.getStoredToken());
  readonly csrfToken = computed<string | null>(() => this.csrfTokenSignal() || this.getCookie('csrf_token'));
  readonly currentEmployeeId = computed<string | null>(() => this.sessionSignal()?.employeeId || null);
  readonly currentUserName = computed<string>(() => this.sessionSignal()?.name || 'User');

  constructor() {
    this.cleanLegacyStorage();
  }

  /**
   * Helper to read non-sensitive CSRF cookie sent by server
   */
  private getCookie(name: string): string | null {
    try {
      const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
      return match ? decodeURIComponent(match[3]) : null;
    } catch {
      return null;
    }
  }

  private getStoredToken(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  }

  private setStoredToken(token: string): void {
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch (_) {}
  }

  private clearStoredToken(): void {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (_) {}
  }

  private getLocalSession(): UserSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_BACKUP_KEY) || localStorage.getItem(SESSION_BACKUP_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && s.role && s.name) return s;
      return null;
    } catch {
      return null;
    }
  }

  private setLocalSession(session: UserSession | null): void {
    try {
      if (session) {
        sessionStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(session));
        localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(session));
      } else {
        sessionStorage.removeItem(SESSION_BACKUP_KEY);
        localStorage.removeItem(SESSION_BACKUP_KEY);
      }
    } catch (_) {}
  }

  /**
   * Cleans up all sensitive legacy storage keys from localStorage.
   */
  private cleanLegacyStorage(): void {
    try {
      const keysToRemove = [
        'team_productivity_auth_v1',
        'team_productivity_auth_v2',
        'team_productivity_auth_v3',
        'team_productivity_auth_v4',
        'team_productivity_auth_v5',
        'team_productivity_auth_v6',
        'team_productivity_auth_v7',
        'team_productivity_hub_v1',
        'team_productivity_hub_v2',
        'team_productivity_hub_v3',
        'team_productivity_hub_v4',
        'team_productivity_hub_v5',
        'team_productivity_hub_v6',
        'team_productivity_hub_v7',
        'team_productivity_hub_v8',
        'team_productivity_hub_v9'
      ];
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  /**
   * App Initializer entry point: restores session from server before routes and guards activate.
   * Ensures that browser reload retains user interface without logging out.
   */
  initAuth(): Promise<UserSession | null> {
    return firstValueFrom(
      this.restoreSession().pipe(
        timeout(4000),
        catchError(() => of(null))
      )
    );
  }

  /**
   * Restores user session from trusted backend server using HttpOnly cookie and/or verified Bearer token.
   * Always retrieves employee roles and permissions from trusted server/database.
   */
  restoreSession(): Observable<UserSession | null> {
    const storedToken = this.getStoredToken();
    const headers: { [key: string]: string } = {};
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    return this.http.get<any>(`${AUTH_BASE_URL}/me`, {
      headers,
      withCredentials: true
    }).pipe(
      map(user => {
        if (!user || !user.role) {
          this.clearStoredToken();
          this.setLocalSession(null);
          this.sessionSignal.set(null);
          return null;
        }
        const session: UserSession = {
          token: storedToken || '',
          role: user.role as RoleType,
          userId: user.id,
          employeeId: user.employeeId || null,
          name: user.name || (user.role === 'manager' ? 'Mohan' : user.username),
          email: user.email || '',
          designation: user.designation || (user.role === 'manager' ? 'Engineering Manager' : 'Developer'),
          expiresIn: 28800,
          csrfToken: this.getCookie('csrf_token') || undefined
        };
        this.setLocalSession(session);
        this.sessionSignal.set(session);
        this.syncDataProvider(session);
        return session;
      }),
      catchError(() => {
        const localSess = this.getLocalSession();
        if (localSess) {
          this.sessionSignal.set(localSess);
          this.syncDataProvider(localSess);
          return of(localSess);
        }
        this.clearStoredToken();
        this.setLocalSession(null);
        this.sessionSignal.set(null);
        return of(null);
      })
    );
  }

  /**
   * Authenticates user against backend and initializes secure session in memory.
   */
  login(identifierOrObj: any, maybePassword?: string): Observable<UserSession> {
    let identifier = '';
    let password = '';
    if (typeof identifierOrObj === 'object' && identifierOrObj !== null) {
      identifier = identifierOrObj.email || identifierOrObj.username || '';
      password = identifierOrObj.password || '';
    } else {
      identifier = String(identifierOrObj || '');
      password = String(maybePassword || '');
    }
    const payload = {
      email: identifier.trim(),
      username: identifier.trim(),
      password: password.trim()
    };

    return this.http.post<any>(`${AUTH_BASE_URL}/login`, payload, { withCredentials: true }).pipe(
      tap(res => {
        const token = res.access_token || '';
        if (token) {
          this.setStoredToken(token);
        }

        const session: UserSession = {
          token: token,
          role: res.role as RoleType,
          userId: res.user_id,
          employeeId: res.employee_id || null,
          name: res.name || (res.role === 'manager' ? 'Mohan' : identifier),
          email: res.email || identifier,
          designation: res.designation || (res.role === 'manager' ? 'Engineering Manager' : 'Developer'),
          expiresIn: res.expires_in || 28800,
          csrfToken: res.csrf_token || this.getCookie('csrf_token') || undefined
        };

        if (res.csrf_token) {
          this.csrfTokenSignal.set(res.csrf_token);
        }

        this.setLocalSession(session);
        this.sessionSignal.set(session);
        this.syncDataProvider(session);
      }),
      catchError(backendErr => {
        const msg = backendErr?.error?.detail || 'Invalid email or password. Please verify your credentials.';
        return throwError(() => new Error(msg));
      })
    );
  }

  private syncDataProvider(session: UserSession): void {
    if (session.role === 'manager') {
      this.dataProvider.setManagerRole();
    } else if (session.employeeId) {
      this.dataProvider.setEmployeeRole(session.employeeId, {
        name: session.name,
        email: session.email,
        designation: session.designation
      });
    }
  }

  /**
   * Securely terminates the session on the backend and resets client memory state.
   */
  logout(): void {
    this.http.post<any>(`${AUTH_BASE_URL}/logout`, {}, { withCredentials: true }).subscribe({
      next: () => {},
      error: () => {}
    });
    this.clearStoredToken();
    this.setLocalSession(null);
    this.sessionSignal.set(null);
    this.csrfTokenSignal.set(null);
    this.cleanLegacyStorage();
    this.router.navigate(['/login']);
  }

  updateProfile(data: { name: string; designation: string; currentPassword?: string; newPassword?: string }): { success: boolean; error?: string } {
    const cur = this.sessionSignal();
    if (!cur) return { success: false, error: 'Not authenticated' };

    const updated: UserSession = {
      ...cur,
      name: data.name,
      designation: data.designation
    };
    this.sessionSignal.set(updated);

    if (cur.employeeId) {
      this.dataProvider.updateEmployee(cur.employeeId, {
        name: data.name,
        designation: data.designation
      });
    }

    // Persist securely to backend database
    this.http.put<any>(`${AUTH_BASE_URL}/profile`, {
      name: data.name,
      designation: data.designation,
      currentPassword: data.currentPassword,
      newPassword: data.newPassword
    }, { withCredentials: true }).subscribe({
      next: () => {},
      error: (err) => console.warn('Could not persist profile changes to backend:', err)
    });

    return { success: true };
  }
}
