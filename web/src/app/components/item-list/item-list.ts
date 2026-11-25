import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { SupabaseService } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { RouterLink } from '@angular/router'
import { DecimalPipe } from '@angular/common'
import { PermissionService } from '../../services/permission.service'

type SortKey = 'sku' | 'category_name' | 'name' | 'current_stock' | 'cost_per_unit' | 'batch_count'
type SortDirection = 'asc' | 'desc'

interface ItemListRow {
  id: string
  sku?: string | null
  category_name?: string | null
  name?: string | null
  current_stock?: number | string | null
  cost_per_unit?: number | string | null
  is_manufactured?: boolean | null
  is_saleable?: boolean | null
  batch_count?: number
}

interface CategoryOption {
  id: string
  name: string
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
  public permissions = inject(PermissionService)

  loading = signal(false)
  private rawItems = signal<ItemListRow[]>([])
  categories = signal<CategoryOption[]>([])
  categoryFilter = signal<string>('')
  searchTerm = signal<string>('')
  manufacturedFilter = signal<string>('')
  saleableFilter = signal<string>('')
  sortKey = signal<SortKey>('name')
  sortDirection = signal<SortDirection>('asc')
  items = computed(() => {
    const rows = this.rawItems()
    const key = this.sortKey()
    const direction = this.sortDirection()
    const factor = direction === 'asc' ? 1 : -1
    const categoryFilter = this.categoryFilter()
    const searchTerm = this.searchTerm().trim().toLowerCase()
    const manufacturedFilter = this.manufacturedFilter()
    const saleableFilter = this.saleableFilter()

    return rows
      .filter(item => !categoryFilter || item.category_name === categoryFilter)
      .filter(item => !searchTerm
        || (item.sku ?? '').toLowerCase().includes(searchTerm)
        || (item.name ?? '').toLowerCase().includes(searchTerm))
      .filter(item => !manufacturedFilter || String(!!item.is_manufactured) === manufacturedFilter)
      .filter(item => !saleableFilter || String(!!item.is_saleable) === saleableFilter)
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
    await Promise.all([
      this.loadItems(),
      this.loadCategories()
    ])
  }

  async loadCategories() {
    const { data, error } = await this.supabase.getAllCategories()
    if (error) return
    this.categories.set((data || []) as CategoryOption[])
  }

  onCategoryFilterChange(value: string) {
    this.categoryFilter.set(value)
  }

  onSearchTermChange(value: string) {
    this.searchTerm.set(value)
  }

  onManufacturedFilterChange(value: string) {
    this.manufacturedFilter.set(value)
  }

  onSaleableFilterChange(value: string) {
    this.saleableFilter.set(value)
  }


  async loadItems() {
    try {
      this.loading.set(true)
      const [itemsResponse, batchesResponse] = await Promise.all([
        this.supabase.getAllItems(),
        this.supabase.getNonZeroItemBatchCounts()
      ])
      if (itemsResponse.error) throw itemsResponse.error
      if (batchesResponse.error) throw batchesResponse.error

      const batchCounts = new Map<string, number>()
      for (const batch of (batchesResponse.data || []) as { item_id: string }[]) {
        batchCounts.set(batch.item_id, (batchCounts.get(batch.item_id) || 0) + 1)
      }

      const rows = (itemsResponse.data || []) as ItemListRow[]
      this.rawItems.set(rows.map(item => ({
        ...item,
        batch_count: batchCounts.get(item.id) || 0
      })))
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
    if (key === 'current_stock' || key === 'cost_per_unit' || key === 'batch_count') {
      const leftNumber = Number(left ?? 0)
      const rightNumber = Number(right ?? 0)
      return leftNumber - rightNumber
    }

    const leftText = (left ?? '').toString().toLowerCase()
    const rightText = (right ?? '').toString().toLowerCase()
    return leftText.localeCompare(rightText)
  }
}
