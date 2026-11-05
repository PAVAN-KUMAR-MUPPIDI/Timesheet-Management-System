import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  toast(message: string, duration = 2400): void {
    this.snackBar.open(message, 'Close', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  confirm(title: string, message: string, okLabel = 'Confirm', isDanger = false): Observable<boolean> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { title, message, okLabel, isDanger }
    });
    return dialogRef.afterClosed();
  }
}
