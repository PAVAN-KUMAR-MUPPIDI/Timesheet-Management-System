import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { CSRF_HEADER_NAME } from '../models/models';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();
  const csrfToken = authService.csrfToken();

  const headers: { [key: string]: string } = {};

  // Attach CSRF protection header for state-changing HTTP methods
  if (csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase())) {
    headers[CSRF_HEADER_NAME] = csrfToken;
  }

  // Attach Bearer token header if present in memory
  if (token && !req.url.includes('/api/auth/login')) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Always enable withCredentials so secure HttpOnly cookies are transported
  const authReq = req.clone({
    withCredentials: true,
    setHeaders: headers
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 Unauthorized: clear in-memory state and redirect to login
      if (error.status === 401 && !req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/me')) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
