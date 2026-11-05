import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DataProviderService } from '../../../core/services/data-provider.service';
import { CalculationService, NO_AI } from '../../../core/services/calculation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Employee, TimesheetEntry, ControlledItem, API_BASE_URL } from '../../../core/models/models';

export interface PreviewRow {
  rowNumber: number;
  originalData: { [key: string]: string };
  parsedData: any;
  status: 'valid' | 'corrected' | 'warning' | 'invalid' | 'duplicate';
  errors: string[];
  warnings: string[];
  corrections: string[];
  isDuplicate: boolean;
  isImportable: boolean;
}

export interface PreviewSummary {
  totalRows: number;
  validCount: number;
  correctedCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateCount: number;
  importableCount: number;
}

export interface PreviewResponse {
  success: boolean;
  importId: string;
  filename: string;
  employeeId: string;
  employeeName: string;
  employeeTeam: string;
  summary: PreviewSummary;
  headersDetected: string[];
  headersMapped: { [raw: string]: string };
  unmappedHeaders: string[];
  rows: PreviewRow[];
}

@Component({
  selector: 'app-import-timesheets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './import-timesheets.component.html',
  styleUrls: ['./import-timesheets.component.scss']
})
export class ImportTimesheetsComponent {
  readonly Math = Math;
  dataService = inject(DataProviderService);
  calcService = inject(CalculationService);
  notification = inject(NotificationService);
  private http = inject(HttpClient);
  private router = inject(Router);

  employees = this.dataService.employees;
  selectedEmpId = signal<string>('E01');

  selectedEmp = computed<Employee | undefined>(() => {
    return this.employees().find(e => e.id === this.selectedEmpId()) || this.employees()[0];
  });

  // Upload & File State
  selectedFile = signal<File | null>(null);
  isDragging = signal<boolean>(false);
  isValidating = signal<boolean>(false);
  isImporting = signal<boolean>(false);
  validationError = signal<string | null>(null);

  // Preview State
  preview = signal<PreviewResponse | null>(null);
  selectedDuplicateRowNumbers = signal<Set<number>>(new Set());
  targetState = signal<'Submitted' | 'Draft'>('Submitted');
  activeFilter = signal<'all' | 'valid' | 'corrected' | 'warning' | 'invalid' | 'duplicate'>('all');
  searchQuery = signal<string>('');
  currentPage = signal<number>(1);
  pageSize = signal<number>(15);

  // Dynamic importable count reflecting base importable rows + user-selected duplicate rows
  importableCount = computed<number>(() => {
    const base = this.preview()?.summary.importableCount || 0;
    return base + this.selectedDuplicateRowNumbers().size;
  });

  duplicateRows = computed<PreviewRow[]>(() => {
    const p = this.preview();
    if (!p || !p.rows) return [];
    return p.rows.filter(r => r.status === 'duplicate' || r.isDuplicate);
  });

  hasDuplicates = computed<boolean>(() => {
    return this.duplicateRows().length > 0;
  });

  areAllDuplicatesSelected = computed<boolean>(() => {
    const dups = this.duplicateRows();
    if (dups.length === 0) return false;
    const sel = this.selectedDuplicateRowNumbers();
    return dups.every(r => sel.has(r.rowNumber));
  });

  isDuplicateSelected(rowNumber: number): boolean {
    return this.selectedDuplicateRowNumbers().has(rowNumber);
  }

  toggleDuplicate(rowNumber: number): void {
    const current = new Set(this.selectedDuplicateRowNumbers());
    if (current.has(rowNumber)) {
      current.delete(rowNumber);
    } else {
      current.add(rowNumber);
    }
    this.selectedDuplicateRowNumbers.set(current);
  }

  toggleAllDuplicates(): void {
    const dups = this.duplicateRows();
    if (dups.length === 0) return;
    if (this.areAllDuplicatesSelected()) {
      this.selectedDuplicateRowNumbers.set(new Set());
    } else {
      this.selectedDuplicateRowNumbers.set(new Set(dups.map(r => r.rowNumber)));
    }
  }

  // Tab View
  activeTab = signal<'import' | 'config'>(
    (typeof sessionStorage !== 'undefined' && (sessionStorage.getItem('import_timesheets_active_tab') as 'import' | 'config')) || 'import'
  );

  switchTab(tab: 'import' | 'config'): void {
    this.activeTab.set(tab);
    try {
      sessionStorage.setItem('import_timesheets_active_tab', tab);
    } catch (_) {}
  }

  // New controlled field inputs
  newTaskType = '';
  newPriority = '';
  newStatus = '';
  newAiTool = '';

  // Controlled configuration items (with Active/Inactive status)
  taskTypes = this.dataService.taskTypeItems;
  priorities = this.dataService.priorityItems;
  statuses = this.dataService.statusItems;
  aiTools = this.dataService.aiToolItems;

  // Filtered rows for the preview table
  filteredRows = computed<PreviewRow[]>(() => {
    const p = this.preview();
    if (!p || !p.rows) return [];

    let list = p.rows;
    const filter = this.activeFilter();
    if (filter !== 'all') {
      list = list.filter(r => r.status === filter);
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(r => {
        const pd = r.parsedData || {};
        return (
          String(r.rowNumber).includes(q) ||
          String(pd.date || '').toLowerCase().includes(q) ||
          String(pd.project || '').toLowerCase().includes(q) ||
          String(pd.taskType || '').toLowerCase().includes(q) ||
          String(pd.details || '').toLowerCase().includes(q) ||
          String(pd.tool || '').toLowerCase().includes(q)
        );
      });
    }

    return list;
  });

  totalPages = computed<number>(() => {
    return Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize()));
  });

  paginatedRows = computed<PreviewRow[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredRows().slice(start, start + this.pageSize());
  });

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(false);
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      this.handleFile(e.dataTransfer.files[0]);
    }
  }

  onFileInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  handleFile(file: File): void {
    this.validationError.set(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      this.validationError.set(`Unsupported file format '.${ext}'. Please choose a valid .xlsx or .csv file.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.validationError.set('File size exceeds 10MB limit. Please upload a smaller file.');
      return;
    }

    this.selectedFile.set(file);
    this.preview.set(null);
    this.selectedDuplicateRowNumbers.set(new Set());
    this.currentPage.set(1);
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.preview.set(null);
    this.selectedDuplicateRowNumbers.set(new Set());
    this.validationError.set(null);
    this.currentPage.set(1);
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  downloadTemplate(): void {
    this.http.get(`${API_BASE_URL}/timesheets/import/sample-template`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timesheet_import_template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        this.notification.toast('Sample CSV template downloaded ✓');
      },
      error: () => {
        // Client-side fallback template generator
        const csv = "Date,Project,Module / Page,Task Type,Task Details,Priority,Status,Planned Hours,Actual Hours,AI Effort / AI Hours,AI Tool Used,Notes / Justification\n" +
          "2026-10-20,Customer Portal,Login Page,Back-End Development,Implement OAuth2 login with Azure AD,High,Completed,8.0,6.5,2.0,GitHub Copilot,\n" +
          "2026-10-21,Analytics Hub,Dashboard,Bug Fixing,Fix KPI metric calculation rounding error,Critical,Completed,4.0,4.0,1.5,Claude,\n" +
          "2026-10-22,Mobile App,Checkout,Testing,Write Cypress end-to-end integration tests,Medium,In Progress,6.0,5.0,0.0,ChatGPT,\n" +
          "2026-10-23,Internal CRM,User Profile,Documentation,Update technical user manual and API docs,Low,Completed,4.0,5.0,1.0,ChatGPT,Required extra manual reviews";
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timesheet_import_template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        this.notification.toast('Sample CSV template generated ✓');
      }
    });
  }

  validateFile(): void {
    const file = this.selectedFile();
    if (!file) {
      this.validationError.set('Please select an Excel or CSV file first.');
      return;
    }

    const empId = this.selectedEmpId();
    if (!empId) {
      this.validationError.set('Please select the target team member.');
      return;
    }

    this.isValidating.set(true);
    this.validationError.set(null);

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('employee_id', empId);

    this.http.post<PreviewResponse>(`${API_BASE_URL}/timesheets/import/preview`, formData).subscribe({
      next: (res) => {
        this.isValidating.set(false);
        if (res && res.success) {
          this.preview.set(res);
          this.selectedDuplicateRowNumbers.set(new Set());
          this.activeFilter.set('all');
          this.currentPage.set(1);
          this.notification.toast(`File parsed: ${res.summary.importableCount} of ${res.summary.totalRows} records eligible to import.`);
        } else {
          this.validationError.set('File validation was unsuccessful.');
        }
      },
      error: (err) => {
        this.isValidating.set(false);
        const msg = (err.status === 0)
          ? 'Cannot connect to backend server. Please ensure the backend is running at http://127.0.0.1:8000.'
          : (err.error?.detail || err.message || 'Failed to parse timesheet file.');
        this.validationError.set(msg);
      }
    });
  }

  confirmImport(): void {
    const p = this.preview();
    if (!p) return;

    const count = this.importableCount();
    if (count === 0) {
      this.notification.toast('No eligible records found to import.');
      return;
    }

    const target = this.targetState();
    const emp = this.selectedEmp();
    const empName = emp ? emp.name : p.employeeName;
    const selectedDups = Array.from(this.selectedDuplicateRowNumbers());
    const dupNotice = selectedDups.length > 0 ? ` (including ${selectedDups.length} selected duplicate${selectedDups.length > 1 ? 's' : ''})` : '';

    this.notification.confirm(
      'Confirm Timesheet Import',
      `Import ${count} timesheet records${dupNotice} for ${empName} as ${target}? ${target === 'Submitted' ? 'Submitted entries will be locked.' : 'Draft entries can be edited.'}`,
      `Import ${count} Records`
    ).subscribe(confirmed => {
      if (!confirmed) return;

      this.isImporting.set(true);
      const payload = {
        importId: p.importId,
        employeeId: p.employeeId,
        targetState: target,
        selectedDuplicateRowNumbers: selectedDups
      };

      this.http.post<any>(`${API_BASE_URL}/timesheets/import/confirm`, payload).subscribe({
        next: (res) => {
          this.isImporting.set(false);
          if (res && res.success) {
            // Update local state so all UI tables, cards, and reports reflect the new data immediately!
            if (res.entries && Array.isArray(res.entries)) {
              this.dataService.importEntries(res.entries);
            }
            this.notification.toast(`Import Successful! ${res.importedCount} entries saved for ${empName} ✓`, 4000);
            this.clearFile();
          } else {
            this.notification.toast(res.error || 'Import failed.');
          }
        },
        error: (err) => {
          this.isImporting.set(false);
          this.notification.toast(err.error?.detail || 'Import confirmation failed.');
        }
      });
    });
  }

  downloadErrorReport(): void {
    const p = this.preview();
    if (!p) return;

    const headers = ['Row Number', 'Status', 'Date', 'Project', 'Task Type', 'Issues / Reasons', 'Corrections Applied'];
    const rows: string[][] = [];

    p.rows.forEach(r => {
      if (r.errors.length > 0 || r.warnings.length > 0 || r.corrections.length > 0) {
        const pd = r.parsedData || {};
        const issues = [...r.errors, ...r.warnings].join(' | ');
        const corrections = r.corrections.join(' | ');
        rows.push([
          String(r.rowNumber),
          r.status.toUpperCase(),
          String(pd.date || ''),
          String(pd.project || ''),
          String(pd.taskType || ''),
          issues,
          corrections
        ]);
      }
    });

    if (rows.length === 0) {
      this.notification.toast('No issues or warnings found to export.');
      return;
    }

    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet_validation_report_${p.employeeId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    this.notification.toast('Validation report downloaded ✓');
  }

  setFilter(filter: 'all' | 'valid' | 'corrected' | 'warning' | 'invalid' | 'duplicate'): void {
    this.activeFilter.set(filter);
    this.currentPage.set(1);
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  // Controlled Fields Manager Methods
  addControlled(category: string, value: string): void {
    const v = value.trim();
    if (!v) return;
    this.dataService.addControlledField(category, v);
    if (category === 'taskTypes') this.newTaskType = '';
    else if (category === 'priorities') this.newPriority = '';
    else if (category === 'statuses') this.newStatus = '';
    else if (category === 'aiTools') this.newAiTool = '';
    this.notification.toast(`Added '${v}' (Inactive by default) ✓`);
  }

  toggleControlledStatus(category: string, item: ControlledItem): void {
    const nextStatus = item.status === 'Active' ? 'Inactive' : 'Active';
    this.dataService.toggleControlledStatus(category, item.name, nextStatus);
    this.notification.toast(`Switched '${item.name}' to ${nextStatus} ✓`);
  }

  deleteControlled(category: string, value: string): void {
    this.notification.confirm(
      `Delete ${category.slice(0, -1)}?`,
      `Are you sure you want to delete '${value}'? This will remove it from dropdown selections for both managers and employees.`,
      'Delete'
    ).subscribe(confirmed => {
      if (confirmed) {
        this.dataService.deleteControlledField(category, value);
        this.notification.toast(`Removed '${value}' from ${category} ✓`);
      }
    });
  }
}
