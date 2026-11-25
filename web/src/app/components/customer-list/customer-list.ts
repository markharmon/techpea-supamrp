import { Component, inject, OnInit, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { Customer, SupabaseService } from '../../services/supabase'
import { PermissionService } from '../../services/permission.service'

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [LoadingDirective, RouterLink],
  templateUrl: './customer-list.html',
  styleUrl: './customer-list.scss'
})
export class CustomerListComponent implements OnInit {
  private supabase = inject(SupabaseService)
  private permissions = inject(PermissionService)

  canManage = this.permissions.hasAny(['admin', 'supervisor', 'staff'])
  loading = signal(false)
  customers = signal<Customer[]>([])
  errorMessage = signal('')

  async ngOnInit() {
    await this.loadCustomers()
  }

  async loadCustomers() {
    this.loading.set(true)
    this.errorMessage.set('')

    try {
      const { data, error } = await this.supabase.getAllCustomers()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('No customer data was returned.')
      this.customers.set(data)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load customers.')
    } finally {
      this.loading.set(false)
    }
  }
}
