import { Component, inject, OnInit, signal } from '@angular/core'
import { SupabaseService } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { NgClass } from '@angular/common'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-work-orders-list',
  standalone: true,
  imports: [LoadingDirective, NgClass, RouterLink],
  templateUrl: './work-order-list.html',
  styleUrl: './work-order-list.scss'
})
export class WorkOrderListComponent implements OnInit {
  private supabase = inject(SupabaseService)

  loading = signal(false)
  workOrders = signal<any[]>([])
  
  page = signal(1)
  pageSize = signal(10)
  total = signal(0)
  hasMore = signal(false)

  availableStatuses = ['planned', 'in_progress', 'completed', 'cancelled']
  selectedStatuses = signal<string[]>([])

  async ngOnInit() {
    await this.loadOrders()
  }

  async loadOrders() {
    try {
      this.loading.set(true)
      const { data, count, error } = await this.supabase.getAllWorkOrders(
        this.page(), 
        this.pageSize(),
        this.selectedStatuses()
      )
      if (error) throw error
      
      this.workOrders.set(data || [])
      this.total.set(count || 0)
      this.hasMore.set((this.page() * this.pageSize()) < (count || 0))
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async nextPage() {
    if (this.hasMore()) {
      this.page.update(p => p + 1)
      await this.loadOrders()
    }
  }

  async prevPage() {
    if (this.page() > 1) {
      this.page.update(p => p - 1)
      await this.loadOrders()
    }
  }

  async toggleStatus(status: string) {
    this.selectedStatuses.update(current => {
      if (current.includes(status)) {
        return current.filter(s => s !== status)
      } else {
        return [...current, status]
      }
    })
    this.page.set(1)
    await this.loadOrders()
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
