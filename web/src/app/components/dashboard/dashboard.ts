import { Component } from '@angular/core';
import { LowStockWidgetComponent } from './low-stock-widget/low-stock-widget';
import { WorkOrdersWidgetComponent } from './work-orders-widget/work-orders-widget';

@Component({
  selector: 'app-dashboard',
  imports: [WorkOrdersWidgetComponent, LowStockWidgetComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {}
