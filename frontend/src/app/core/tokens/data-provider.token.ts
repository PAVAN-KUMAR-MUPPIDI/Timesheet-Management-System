import { InjectionToken } from '@angular/core';

export const DATA_MODE_TOKEN = new InjectionToken<string>('DATA_MODE', {
  providedIn: 'root',
  factory: () => 'local' // 'local' or 'api'
});
