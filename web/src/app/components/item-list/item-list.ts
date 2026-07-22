import { Component, inject, OnInit, signal } from '@angular/core'
import { SupabaseService } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { RouterLink } from '@angular/router'
import { DecimalPipe } from '@angular/common'

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
  items = signal<any[]>([])

  async ngOnInit() {
    await this.loadItems()
  }

  async loadItems() {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getAllItems()
      if (error) throw error
      this.items.set(data || [])
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }
}
