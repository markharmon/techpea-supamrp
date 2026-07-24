import { Component, inject, OnInit, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { SupabaseService } from '../../services/supabase'

interface CategoryRow {
  id: string
  name: string
}

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [LoadingDirective, RouterLink],
  templateUrl: './category-list.html',
  styleUrl: './category-list.scss'
})
export class CategoryListComponent implements OnInit {
  private supabase = inject(SupabaseService)

  loading = signal(false)
  categories = signal<CategoryRow[]>([])

  async ngOnInit() {
    await this.loadCategories()
  }

  async loadCategories() {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getAllCategories()
      if (error) throw error
      this.categories.set((data || []) as CategoryRow[])
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async deleteCategory(id: string) {
    if (!confirm('Delete this category?')) {
      return
    }

    try {
      this.loading.set(true)
      const { error } = await this.supabase.deleteCategory(id)
      if (error) throw error
      this.categories.update(current => current.filter(category => category.id !== id))
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }
}
