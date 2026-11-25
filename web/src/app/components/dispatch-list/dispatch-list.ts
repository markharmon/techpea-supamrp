import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { DatePipe } from '@angular/common'
import { RouterLink } from '@angular/router'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { Dispatch, DispatchListRow, SupabaseService } from '../../services/supabase'
import { PermissionService } from '../../services/permission.service'

export interface DispatchItemSummary {
  name: string
  unit: string
  quantity: number
  batches: number
}

@Component({
  selector: 'app-dispatch-list',
  standalone: true,
  imports: [DatePipe, RouterLink, LoadingDirective],
  templateUrl: './dispatch-list.html',
  styleUrl: './dispatch-list.scss'
})
export class DispatchListComponent implements OnInit {
  private supabase = inject(SupabaseService)
  private permissions = inject(PermissionService)

  canManage = this.permissions.hasAny(['admin', 'supervisor', 'staff'])
  loading = signal(false)
  errorMessage = signal('')
  dispatches = signal<DispatchListRow[]>([])
  itemSummaries = computed(() => new Map(
    this.dispatches().map(dispatch => [dispatch.id, this.summarize(dispatch)])
  ))
  page = signal(1)
  total = signal(0)
  readonly pageSize = 50

  async ngOnInit() {
    await this.loadDispatches()
  }

  private summarize(dispatch: DispatchListRow): DispatchItemSummary[] {
    const summaries = new Map<string, DispatchItemSummary>()
    for (const line of dispatch.dispatch_item_batches ?? []) {
      const key = line.item_batches?.item_id ?? 'unknown'
      const item = line.item_batches?.items
      const summary = summaries.get(key) ?? {
        name: item?.name ?? 'Unknown item', unit: item?.unit ?? '', quantity: 0, batches: 0
      }
      summary.quantity += Number(line.quantity)
      summary.batches += 1
      summaries.set(key, summary)
    }
    // Round away floating-point artifacts from summing decimal quantities.
    return [...summaries.values()]
      .map(summary => ({ ...summary, quantity: Math.round(summary.quantity * 1e9) / 1e9 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async loadDispatches(page = this.page()) {
    if (this.loading()) return
    this.loading.set(true)
    this.errorMessage.set('')
    try {
      const { data, error, count } = await this.supabase.getDispatches(page, this.pageSize)
      if (error) throw new Error(error.message)
      if (!data || count === null) throw new Error('No dispatch data was returned.')
      this.dispatches.set(data)
      this.total.set(count)
      this.page.set(page)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load dispatches.')
    } finally {
      this.loading.set(false)
    }
  }

  async deleteDispatch(dispatch: Dispatch) {
    if (!this.canManage()) {
      this.errorMessage.set('You do not have permission to delete dispatches.')
      return
    }
    if (this.loading()) return
    if (!confirm(`Delete the dispatch to ${dispatch.customer_name} dated ${dispatch.dispatch_date}? All dispatched quantities will be restored to stock.`)) return

    this.loading.set(true)
    this.errorMessage.set('')
    try {
      const { error } = await this.supabase.deleteDispatch(dispatch.id, dispatch.updated_at)
      if (error) throw new Error(error.message)
      const page = this.dispatches().length === 1 && this.page() > 1 ? this.page() - 1 : this.page()
      this.loading.set(false)
      await this.loadDispatches(page)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete dispatch.')
    } finally {
      this.loading.set(false)
    }
  }
}
