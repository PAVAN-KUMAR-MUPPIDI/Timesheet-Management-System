import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="card-h">
        <h3>{{ title }}</h3>
        <span class="sub" *ngIf="sub">{{ sub }}</span>
      </div>
      <div class="chart" [class.tall]="tall">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class ChartCardComponent {
  @Input({ required: true }) title!: string;
  @Input() sub?: string;
  @Input() tall?: boolean = false;
}
