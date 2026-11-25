import { NgClass } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../services/supabase';
import { LoadingDirective } from '../../../shared/loading/loading.directive';
import { PermissionService } from '../../../services/permission.service';

@Component({
  selector: 'app-work-orders-widget',
  standalone: true,
  imports: [LoadingDirective, NgClass, RouterLink],
  templateUrl: './work-orders-widget.html',
  styleUrl: './work-orders-widget.scss',
})
export class WorkOrdersWidgetComponent implements OnInit {
  private supabase = inject(SupabaseService)

  public title = input('Work Orders')
  // 0 = the current Monday-to-Sunday week, 1 = the following week, etc.
  public weekOffset = input(0)

  public loading = signal(false)
  public workOrders = signal<any[]>([]);
  public permissions = inject(PermissionService);

  async ngOnInit(): Promise<void> {
    await this.loadWorkOrders()
  }

  async loadWorkOrders(): Promise<void> {
    try {
      this.loading.set(true)
      const { start, end } = this.getWeekRange(this.weekOffset())
      const { data, error } = await this.supabase.getWorkOrdersDueInRange(start, end, 5)
      if (error) throw error
      this.workOrders.set(data || [])
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  private getWeekRange(offsetWeeks: number): { start: string, end: string } {
    const now = new Date()
    const day = now.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day

    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + offsetWeeks * 7)
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)

    const format = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { start: format(monday), end: format(sunday) }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed': return 'success'
      case 'in_progress': return 'info'
      case 'cancelled': return 'danger'
      default: return 'warning'
    }
  }
}

