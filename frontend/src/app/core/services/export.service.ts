import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';

export interface ColumnDef {
  k: string;
  l: string;
  noExport?: boolean;
  pct?: boolean;
  n?: number | boolean;
  v?: (r: any) => any;
  x?: (r: any) => any;
  f?: (v: any, r?: any) => string;
  wrap?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private notification = inject(NotificationService);

  exportData(name: string, cols: ColumnDef[], rows: any[], fmt: 'xlsx' | 'csv'): void {
    const validCols = cols.filter(c => !c.noExport);
    const aoa: any[][] = [
      validCols.map(c => c.l),
      ...rows.map(r => validCols.map(c => {
        const val = c.x ? c.x(r) : (c.v ? c.v(r) : r[c.k]);
        return typeof val === 'number' ? Math.round(val * 100) / 100 : (val ?? '');
      }))
    ];

    const cleanName = name.replace(/<[^>]+>/g, '').replace(/[^\w]+/g, '_');
    const fname = `${cleanName}_${new Date().toISOString().slice(0, 10)}`;

    if (fmt === 'xlsx') {
      try {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = validCols.map(c => ({ wch: Math.max(10, c.l.length + 2) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, cleanName.slice(0, 31));
        XLSX.writeFile(wb, `${fname}.xlsx`);
        this.notification.toast('Excel file exported');
        return;
      } catch (e) {
        console.warn('XLSX export failed, falling back to CSV', e);
      }
    }

    const csv = aoa.map(row => row.map(v => {
      const str = String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fname}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    this.notification.toast('CSV exported');
  }
}
