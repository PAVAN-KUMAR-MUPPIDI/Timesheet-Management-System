import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { AddEmployeeModalComponent } from '../../shared/components/add-employee-modal/add-employee-modal.component';
import { UserProfileModalComponent } from '../../shared/components/user-profile-modal/user-profile-modal.component';
import { DataProviderService } from '../../core/services/data-provider.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    SidebarComponent,
    TopbarComponent,
    AddEmployeeModalComponent,
    UserProfileModalComponent
  ],
  template: `
    <div class="app">
      <app-sidebar [isOpen]="isMenuOpen" (close)="isMenuOpen = false"></app-sidebar>
      <div class="scrim" [class.show]="isMenuOpen" (click)="isMenuOpen = false"></div>

      <div class="main">
        <app-topbar (toggleMenu)="isMenuOpen = !isMenuOpen"></app-topbar>

        <main id="view">
          <router-outlet></router-outlet>
        </main>
      </div>

      <!-- Modals -->
      <app-add-employee-modal></app-add-employee-modal>
      <app-user-profile-modal
        [isOpen]="dataService.showUserProfileModal()"
        (close)="dataService.showUserProfileModal.set(false)"
      ></app-user-profile-modal>
    </div>
  `,
  styles: [`
    .app { display: flex; min-height: 100vh; }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    #view { padding: 22px 24px 40px; max-width: 1500px; width: 100%; }
    .scrim { display: none; }
    @media (max-width: 1024px) {
      .scrim.show { display: block; position: fixed; inset: 0; background: rgba(15,23,42,.35); z-index: 35; }
      #view { padding: 18px 16px 32px; }
    }
  `]
})
export class AppLayoutComponent implements OnInit {
  isMenuOpen = false;
  dataService = inject(DataProviderService);

  ngOnInit(): void {
    this.dataService.loadEmployeesFromBackend();
  }
}
