import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi" [style.--tone]="tone || 'var(--brand)'">
      <div class="l">{{ label }}</div>
      <div class="v" [class.sm]="small" [attr.title]="value">{{ value }}</div>
      <div class="s" *ngIf="subtext" [innerHTML]="subtext"></div>
    </div>
  `
})
export class KpiCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string | number;
  @Input() subtext?: string;
  @Input() tone?: string;
  @Input() small?: boolean = false;
}
