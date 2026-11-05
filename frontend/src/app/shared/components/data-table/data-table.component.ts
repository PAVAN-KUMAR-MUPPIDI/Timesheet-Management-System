import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ColumnDef, ExportService } from '../../../core/services/export.service';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCheckboxModule],
  template: `
    <div class="tbl-tools">
      <h3 *ngIf="title">{{ title }}</h3>
      <span class="sub" *ngIf="sub" style="color:var(--muted); font-size:12.5px">{{ sub }}</span>
      <div class="sp"></div>
      <input *ngIf="!noSearch" type="search" class="search" placeholder="Search…" [(ngModel)]="searchQuery" (ngModelChange)="onSearchChange()">
      <button class="btn sm ghost" (click)="exportFmt('csv')">⭳ CSV</button>
      <button class="btn sm ghost" (click)="exportFmt('xlsx')">⭳ Excel</button>
    </div>

    <div class="tbl-scroll">
      <table class="tbl" [class]="cls || ''">
        <thead>
          <tr>
            <th *ngFor="let col of cols" [class.num]="col.n" [class.sortable]="!col.noExport && col.k !== '_select' && col.k !== '_actions'" (click)="toggleSort(col)">
              <ng-container *ngIf="col.k === '_select'; else defaultTh">
                <div style="display:flex; justify-content:center; align-items:center;" (click)="$event.stopPropagation()">
                  <mat-checkbox
                    [checked]="isAllDraftsSelected()"
                    [indeterminate]="isSomeDraftsSelected()"
                    (change)="onSelectAll($event.checked)"
                    title="Select all draft entries"
                    color="primary">
                  </mat-checkbox>
                </div>
              </ng-container>
              <ng-template #defaultTh>
                <div style="display:inline-flex; align-items:center; justify-content:center; gap:4px;">
                  <span>{{ col.l }}</span>
                  <span *ngIf="sortCol === col.k">{{ sortDir > 0 ? ' ▲' : ' ▼' }}</span>
                </div>
              </ng-template>
            </th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngIf="paginatedRows.length > 0; else emptyTpl">
            <tr *ngFor="let row of paginatedRows" [class]="getRowClass(row)">
              <td *ngFor="let col of cols" [class.num]="col.n" [class.wrap]="col.k === 'details' || col.k === 'notes' || col.k === 'byStr' || col.k === 'tools'">
                @if (col.k === '_select') {
                  <div style="display:flex; justify-content:center; align-items:center;">
                    <!-- If state is Draft: visible & allowed to select Material UI Angular Checkbox -->
                    <mat-checkbox
                      *ngIf="row.state === 'Draft'"
                      [checked]="selectedIds.has(row.id)"
                      (change)="onRowSelect(row, $event.checked)"
                      color="primary"
                      title="Select draft for submission">
                    </mat-checkbox>

                    <!-- If state is Submitted: disabled Material UI Angular Checkbox -->
                    <mat-checkbox
                      *ngIf="row.state === 'Submitted'"
                      [disabled]="true"
                      [checked]="false"
                      style="opacity: 0.28; pointer-events: none;"
                      title="Already submitted">
                    </mat-checkbox>
                  </div>
                } @else if (col.k === '_actions') {
                  <div style="display:flex; gap:6px; align-items:center; justify-content:center;">
                    <button
                      class="btn xs ghost"
                      type="button"
                      [disabled]="row.state === 'Submitted'"
                      [style.opacity]="row.state === 'Submitted' ? '0.38' : '1'"
                      [style.cursor]="row.state === 'Submitted' ? 'not-allowed' : 'pointer'"
                      (click)="row.state !== 'Submitted' && onEditClick(row)"
                      [title]="row.state === 'Submitted' ? 'Submitted entries cannot be edited' : 'Edit this entry'">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      Edit
                    </button>
                    <button
                      class="btn xs danger"
                      type="button"
                      [disabled]="row.state === 'Submitted'"
                      [style.opacity]="row.state === 'Submitted' ? '0.38' : '1'"
                      [style.cursor]="row.state === 'Submitted' ? 'not-allowed' : 'pointer'"
                      (click)="row.state !== 'Submitted' && onDeleteClick(row)"
                      [title]="row.state === 'Submitted' ? 'Submitted entries cannot be deleted' : 'Delete this entry'">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                      Delete
                    </button>
                  </div>
                } @else if (col.f) {
                  <!-- Custom HTML formatter -->
                  <span [innerHTML]="col.f(getVal(col, row), row)" style="display:inline-flex; align-items:center; justify-content:center; width:100%;"></span>
                } @else if (col.pct) {
                  <!-- Formatted percentage -->
                  <span>{{ formatPct(getVal(col, row)) }}</span>
                } @else if (col.n && isNum(getVal(col, row))) {
                  <!-- Formatted number -->
                  <span>{{ formatNum(getVal(col, row)) }}</span>
                } @else {
                  <!-- Default text -->
                  <span>{{ getVal(col, row) ?? '—' }}</span>
                }
              </td>
            </tr>
          </ng-container>
          <ng-template #emptyTpl>
            <tr>
              <td [attr.colspan]="cols.length" class="empty">{{ emptyMsg || 'No records found' }}</td>
            </tr>
          </ng-template>
        </tbody>
      </table>
    </div>

    <div class="tbl-foot">
      <div class="tbl-foot-left" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span *ngIf="filteredRows.length > 0">
          <ng-container *ngIf="effectivePageSize === 0 || filteredRows.length <= effectivePageSize">
            Showing all <b>{{ filteredRows.length }}</b> record{{ filteredRows.length === 1 ? '' : 's' }}
          </ng-container>
          <ng-container *ngIf="effectivePageSize > 0 && filteredRows.length > effectivePageSize">
            Showing <b>{{ recordStart }}–{{ recordEnd }}</b> of <b>{{ filteredRows.length }}</b> records
          </ng-container>
        </span>
        <span *ngIf="filteredRows.length === 0">0 records</span>
        <span *ngIf="foot"> · {{ foot }}</span>
      </div>

      <div class="tbl-foot-right" style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <!-- Page size selector & View All toggle -->
        <div class="tbl-page-size-ctl" *ngIf="(pageSize > 0 || rows.length > 10) && showPageSizeSelector" style="display:inline-flex; align-items:center; gap:6px;">
          <label style="font-size:12px; color:var(--muted); margin:0;">Rows per page:</label>
          <select
            class="tbl-select"
            [ngModel]="isViewingAll ? 0 : currentPageSize"
            (ngModelChange)="onPageSizeChange($event)"
            title="Select number of records per page">
            <option *ngFor="let opt of effectivePageSizeOptions" [value]="opt">{{ opt }}</option>
            <option [value]="0">All ({{ filteredRows.length }})</option>
          </select>

          <button
            *ngIf="allowViewAll && filteredRows.length > (pageSize || 10)"
            class="btn xs ghost"
            type="button"
            (click)="toggleViewAll()"
            [title]="isViewingAll ? 'Switch back to paginated view' : 'Display all records on one page'">
            {{ isViewingAll ? 'Paginate' : 'View All' }}
          </button>
        </div>

        <!-- Pager buttons when paginated -->
        <span class="pager" *ngIf="effectivePageSize > 0 && totalPages > 1">
          <button class="btn xs ghost" (click)="goToPage(0)" [disabled]="page === 0" title="First page">«</button>
          <button class="btn xs ghost" (click)="changePage(-1)" [disabled]="page === 0" title="Previous page">‹ Prev</button>
          <span style="font-size:12px; font-weight:500; padding:0 2px;">{{ page + 1 }} / {{ totalPages }}</span>
          <button class="btn xs ghost" (click)="changePage(1)" [disabled]="page >= totalPages - 1" title="Next page">Next ›</button>
          <button class="btn xs ghost" (click)="goToPage(totalPages - 1)" [disabled]="page >= totalPages - 1" title="Last page">»</button>
        </span>
      </div>
    </div>
  `
})
export class DataTableComponent implements OnInit, OnChanges {
  @Input() title?: string;
  @Input() sub?: string;
  @Input() foot?: string;
  @Input() emptyMsg?: string;
  @Input() cls?: string;
  @Input() noSearch: boolean = false;
  @Input() pageSize: number = 0;
  @Input() pageSizeOptions: number[] = [10, 25, 50];
  @Input() showPageSizeSelector: boolean = true;
  @Input() allowViewAll: boolean = true;
  @Input() cols: ColumnDef[] = [];
  @Input() rows: any[] = [];
  @Input() rowClass?: (row: any) => string;
  @Input() selectedIds: Set<string> = new Set<string>();

  @Output() selectChange = new EventEmitter<{ row: any; checked: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();

  private exportService = inject(ExportService);

  searchQuery: string = '';
  sortCol: string | null = null;
  sortDir: number = 1;
  page: number = 0;
  currentPageSize: number = 0;
  isViewingAll: boolean = false;

  filteredRows: any[] = [];
  paginatedRows: any[] = [];
  totalPages: number = 1;

  ngOnInit(): void {
    if (this.pageSize > 0) {
      this.currentPageSize = this.pageSize;
    }
    this.updateView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageSize'] && this.pageSize > 0 && !this.isViewingAll) {
      this.currentPageSize = this.pageSize;
    }
    if (changes['rows'] || changes['cols'] || changes['pageSize']) {
      this.updateView();
    }
  }

  get effectivePageSize(): number {
    return this.isViewingAll ? 0 : this.currentPageSize;
  }

  get effectivePageSizeOptions(): number[] {
    const set = new Set(this.pageSizeOptions || [10, 25, 50]);
    if (this.pageSize > 0) set.add(this.pageSize);
    if (this.currentPageSize > 0) set.add(this.currentPageSize);
    return Array.from(set).filter(n => n > 0).sort((a, b) => a - b);
  }

  get recordStart(): number {
    if (this.filteredRows.length === 0) return 0;
    if (this.effectivePageSize === 0) return 1;
    return (this.page * this.effectivePageSize) + 1;
  }

  get recordEnd(): number {
    if (this.effectivePageSize === 0) return this.filteredRows.length;
    return Math.min((this.page + 1) * this.effectivePageSize, this.filteredRows.length);
  }

  getVal(col: ColumnDef, row: any): any {
    return col.v ? col.v(row) : row[col.k];
  }

  typeofVal(val: any): string {
    return typeof val;
  }

  isNum(val: any): boolean {
    if (val === null || val === undefined || val === '') return false;
    return typeof val === 'number' ? isFinite(val) : !isNaN(Number(val));
  }

  formatNum(v: any): string {
    const num = typeof v === 'number' ? v : parseFloat(v);
    const val = Math.round((isFinite(num) ? num : 0) * 100) / 100;
    return Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/0$/, '');
  }

  formatPct(v: number): string {
    return (isFinite(v) ? v : 0).toFixed(1) + '%';
  }

  getRowClass(row: any): string {
    if (this.rowClass) return this.rowClass(row);
    if (row._dup || row._inc) return 'row-muted';
    return '';
  }

  isAllDraftsSelected(): boolean {
    const drafts = (this.filteredRows || []).filter(r => r.state === 'Draft');
    return drafts.length > 0 && drafts.every(r => this.selectedIds.has(r.id));
  }

  isSomeDraftsSelected(): boolean {
    const drafts = (this.filteredRows || []).filter(r => r.state === 'Draft');
    const count = drafts.filter(r => this.selectedIds.has(r.id)).length;
    return count > 0 && count < drafts.length;
  }

  onSelectAll(checked: boolean): void {
    this.selectAllChange.emit(checked);
  }

  onRowSelect(row: any, checked: boolean): void {
    this.selectChange.emit({ row, checked });
  }

  onEditClick(row: any): void {
    this.edit.emit(row);
  }

  onDeleteClick(row: any): void {
    this.delete.emit(row);
  }

  toggleSort(col: ColumnDef): void {
    if (col.noExport || col.k === '_select' || col.k === '_actions') return;
    if (this.sortCol === col.k) {
      this.sortDir *= -1;
    } else {
      this.sortCol = col.k;
      this.sortDir = col.n ? -1 : 1;
    }
    this.page = 0;
    this.updateView();
  }

  onSearchChange(): void {
    this.page = 0;
    this.updateView();
  }

  goToPage(p: number): void {
    this.page = p;
    this.updateView();
  }

  changePage(delta: number): void {
    this.page += delta;
    this.updateView();
  }

  onPageSizeChange(val: any): void {
    const num = Number(val);
    if (num === 0) {
      this.isViewingAll = true;
    } else {
      this.isViewingAll = false;
      this.currentPageSize = num;
    }
    this.page = 0;
    this.updateView();
  }

  toggleViewAll(): void {
    if (this.isViewingAll) {
      this.isViewingAll = false;
      this.currentPageSize = this.pageSize > 0 ? this.pageSize : 10;
    } else {
      this.isViewingAll = true;
    }
    this.page = 0;
    this.updateView();
  }

  updateView(): void {
    let result = [...(this.rows || [])];
    const q = this.searchQuery.trim().toLowerCase();

    if (q) {
      result = result.filter(r => this.cols.some(c => !c.noExport && String(this.getVal(c, r) ?? '').toLowerCase().includes(q)));
    }

    if (this.sortCol) {
      const col = this.cols.find(c => c.k === this.sortCol);
      if (col) {
        result.sort((a, b) => {
          const x = this.getVal(col, a);
          const y = this.getVal(col, b);
          return ((typeof x === 'number' && typeof y === 'number') ? (x - y) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * this.sortDir;
        });
      }
    }

    this.filteredRows = result;
    const ps = this.effectivePageSize;
    this.totalPages = ps > 0 ? Math.max(1, Math.ceil(result.length / ps)) : 1;
    this.page = Math.min(this.page, this.totalPages - 1);
    if (this.page < 0) this.page = 0;

    this.paginatedRows = ps > 0 ? result.slice(this.page * ps, this.page * ps + ps) : result;
  }

  exportFmt(fmt: 'xlsx' | 'csv'): void {
    this.exportService.exportData(this.title || 'table', this.cols, this.filteredRows, fmt);
  }
}
