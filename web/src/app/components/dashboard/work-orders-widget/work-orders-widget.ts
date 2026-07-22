import { NgClass } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../services/supabase';
import { LoadingDirective } from '../../../shared/loading/loading.directive';

@Component({
  selector: 'app-work-orders-widget',
  standalone: true,
  imports: [LoadingDirective, NgClass, RouterLink],
  templateUrl: './work-orders-widget.html',
  styleUrl: './work-orders-widget.scss',
})
export class WorkOrdersWidgetComponent implements OnInit {
  private supabase = inject(SupabaseService)
  public loading = signal(false)
  public workOrders = signal<any[]>([])

  async ngOnInit(): Promise<void> {
    await this.loadLatestWorkOrders()
  }

  async loadLatestWorkOrders(): Promise<void> {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getLatestActiveWorkOrders(5)
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

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed': return 'success'
      case 'in_progress': return 'info'
      case 'cancelled': return 'danger'
      default: return 'warning'
    }
  }
}
