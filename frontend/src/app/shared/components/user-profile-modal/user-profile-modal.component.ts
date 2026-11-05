import { Component, Input, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-user-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick($event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3>👤 My Profile & Account Settings</h3>
          <button class="close-btn" (click)="close.emit()">&times;</button>
        </div>

        <div class="modal-body" *ngIf="authService.currentUser() as user">
          <!-- Success / Error Alerts -->
          <div class="alert ok" *ngIf="successMsg">🟢 {{ successMsg }}</div>
          <div class="alert bad" *ngIf="errorMsg">⚠️ {{ errorMsg }}</div>

          <form (ngSubmit)="onSave()">
            <!-- Profile Info Fields -->
            <div class="field-group">
              <div class="f">
                <label>Full Name</label>
                <input type="text" [(ngModel)]="name" name="name" required />
              </div>

              <div class="f">
                <label>Company Email (Read-Only)</label>
                <input type="email" [value]="user.email" readonly disabled class="readonly-input" />
              </div>

              <div class="f">
                <label>Designation</label>
                <input type="text" [(ngModel)]="designation" name="designation" required />
              </div>

              <div class="f">
                <label>Role</label>
                <input type="text" [value]="user.role === 'manager' ? 'Manager (Engineering)' : 'Employee'" readonly disabled class="readonly-input" />
              </div>
            </div>

            <!-- Password Update Section -->
            <div class="pwd-section">
              <div class="section-title">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="showPasswordFields" name="showPasswordFields" />
                  <span>🔒 Change Password</span>
                </label>
              </div>

              <div class="pwd-fields" *ngIf="showPasswordFields">
                <div class="f">
                  <label>Current Password</label>
                  <input type="password" [(ngModel)]="currentPassword" name="currentPassword" placeholder="Enter current password" />
                </div>

                <div class="f">
                  <label>New Password</label>
                  <input type="password" [(ngModel)]="newPassword" name="newPassword" placeholder="Enter new password" />
                </div>

                <div class="f">
                  <label>Confirm New Password</label>
                  <input type="password" [(ngModel)]="confirmPassword" name="confirmPassword" placeholder="Re-enter new password" />
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="close.emit()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="isSaving">
                <span *ngIf="!isSaving">Save Changes</span>
                <span *ngIf="isSaving">Saving...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(5px);
      display: grid; place-items: center; padding: 20px;
      animation: fadeIn .2s ease-out;
    }
    .modal-card {
      background: #ffffff; border-radius: 16px; width: 100%; max-width: 500px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.25); border: 1px solid #e2e8f0;
      overflow: hidden; animation: popIn .25s cubic-bezier(.34, 1.56, .64, 1);
    }
    .modal-header {
      padding: 18px 24px; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
      background: #f8fafc;
    }
    .modal-header h3 { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
    .close-btn { background: transparent; border: none; font-size: 22px; cursor: pointer; color: #64748b; }
    .close-btn:hover { color: #0f172a; }

    .modal-body { padding: 24px; }
    .alert { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; font-weight: 500; }
    .alert.ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
    .alert.bad { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

    .field-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .f { display: flex; flex-direction: column; gap: 5px; }
    .f label { font-size: 12px; font-weight: 600; color: #475569; }
    .f input {
      padding: 9px 12px; border-radius: 8px; border: 1px solid #cbd5e1;
      font-size: 13.5px; color: #0f172a; outline: none; width: 100%; box-sizing: border-box;
    }
    .f input:focus { border-color: #3b6fe0; box-shadow: 0 0 0 3px rgba(59, 111, 224, 0.15); }
    .readonly-input { background: #f1f5f9 !important; color: #64748b !important; cursor: not-allowed; }

    .pwd-section { border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 8px; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; color: #1e293b; cursor: pointer; }
    .pwd-fields { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; padding: 14px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }

    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
    .btn { padding: 9px 18px; border-radius: 8px; font-weight: 600; font-size: 13.5px; cursor: pointer; border: none; }
    .btn-primary { background: #3b6fe0; color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #e2e8f0; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes popIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `]
})
export class UserProfileModalComponent implements OnInit {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  authService = inject(AuthService);

  name = '';
  designation = '';
  showPasswordFields = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  isSaving = false;
  successMsg = '';
  errorMsg = '';

  ngOnInit(): void {
    this.loadUserData();
  }

  loadUserData(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.name = user.name;
      this.designation = user.designation;
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  onSave(): void {
    this.errorMsg = '';
    this.successMsg = '';

    if (!this.name.trim() || !this.designation.trim()) {
      this.errorMsg = 'Name and Designation cannot be empty.';
      return;
    }

    if (this.showPasswordFields) {
      if (!this.currentPassword) {
        this.errorMsg = 'Please enter your current password.';
        return;
      }
      if (!this.newPassword || this.newPassword.length < 3) {
        this.errorMsg = 'New password must be at least 3 characters.';
        return;
      }
      if (this.newPassword !== this.confirmPassword) {
        this.errorMsg = 'New password and confirmation password do not match.';
        return;
      }
    }

    this.isSaving = true;
    const res = this.authService.updateProfile({
      name: this.name.trim(),
      designation: this.designation.trim(),
      ...(this.showPasswordFields ? { currentPassword: this.currentPassword, newPassword: this.newPassword } : {})
    });

    this.isSaving = false;
    if (res.success) {
      this.successMsg = 'Profile updated successfully!';
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.showPasswordFields = false;
      setTimeout(() => {
        this.successMsg = '';
        this.close.emit();
      }, 1200);
    } else {
      this.errorMsg = res.error || 'Failed to update profile.';
    }
  }
}
