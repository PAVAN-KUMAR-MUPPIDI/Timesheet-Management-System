import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  okLabel?: string;
  isDanger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h3 mat-dialog-title style="margin: 0 0 8px; font-weight: 700;">{{ data.title }}</h3>
    <div mat-dialog-content style="color: var(--ink2); font-size: 14px; margin-bottom: 16px;">
      <p>{{ data.message }}</p>
    </div>
    <div mat-dialog-actions align="end" style="gap: 8px;">
      <button class="btn ghost" (click)="onNo()">Cancel</button>
      <button
        class="btn"
        [style.background]="(data.okLabel === 'Delete' || data.isDanger) ? 'var(--bad)' : 'var(--brand)'"
        [style.border-color]="(data.okLabel === 'Delete' || data.isDanger) ? 'var(--bad)' : 'var(--brand)'"
        [style.color]="'#fff'"
        (click)="onYes()">
        {{ data.okLabel || 'Confirm' }}
      </button>
    </div>
  `
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}

  onNo(): void {
    this.dialogRef.close(false);
  }

  onYes(): void {
    this.dialogRef.close(true);
  }
}
