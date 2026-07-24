import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { SupabaseService } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { RouterLink } from '@angular/router'
import { DecimalPipe } from '@angular/common'

type SortKey = 'sku' | 'category_name' | 'name' | 'current_stock' | 'cost_per_unit'
type SortDirection = 'asc' | 'desc'

interface ItemListRow {
  id: string
  sku?: string | null
  category_name?: string | null
  name?: string | null
  current_stock?: number | string | null
  cost_per_unit?: number | string | null
}

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [LoadingDirective, RouterLink, DecimalPipe],
  templateUrl: './item-list.html',
  styleUrl: './item-list.scss'
})
export class ItemListComponent implements OnInit {
  private supabase = inject(SupabaseService)

  loading = signal(false)
  private rawItems = signal<ItemListRow[]>([])
  sortKey = signal<SortKey>('name')
  sortDirection = signal<SortDirection>('asc')
  items = computed(() => {
    const rows = this.rawItems()
    const key = this.sortKey()
    const direction = this.sortDirection()
    const factor = direction === 'asc' ? 1 : -1

    return rows
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const comparison = this.compare(a.item[key], b.item[key], key)
        if (comparison !== 0) {
          return comparison * factor
        }

        return a.index - b.index
      })
      .map(row => row.item)
  })

  async ngOnInit() {
    await this.loadItems()
  }

  async loadItems() {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getAllItems()
      if (error) throw error
      this.rawItems.set((data || []) as ItemListRow[])
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  sortBy(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc')
      return
    }

    this.sortKey.set(key)
    this.sortDirection.set('asc')
  }

  sortLabel(key: SortKey) {
    if (this.sortKey() !== key) {
      return 'sort'
    }

    return this.sortDirection() === 'asc' ? 'asc' : 'desc'
  }

  private compare(
    left: ItemListRow[SortKey],
    right: ItemListRow[SortKey],
    key: SortKey,
  ) {
    if (key === 'current_stock' || key === 'cost_per_unit') {
      const leftNumber = Number(left ?? 0)
      const rightNumber = Number(right ?? 0)
      return leftNumber - rightNumber
    }

    const leftText = (left ?? '').toString().toLowerCase()
    const rightText = (right ?? '').toString().toLowerCase()
    return leftText.localeCompare(rightText)
  }
}
