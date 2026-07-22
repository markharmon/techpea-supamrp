import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../services/supabase';
import { LoadingDirective } from '../../../shared/loading/loading.directive';

@Component({
  selector: 'app-low-stock-widget',
  standalone: true,
  imports: [LoadingDirective, RouterLink, DecimalPipe],
  templateUrl: './low-stock-widget.html',
  styleUrl: './low-stock-widget.scss',
})
export class LowStockWidgetComponent implements OnInit {
  private supabase = inject(SupabaseService)

  public title = input.required<string>()
  public is_manufactured = input(false)
  public is_saleable = input(false)

  public loading = signal(false)
  public items = signal<any[]>([])

  async ngOnInit(): Promise<void> {
    await this.loadItems()
  }

  async loadItems(): Promise<void> {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getLowStockItems(
        this.is_manufactured(),
        this.is_saleable(),
        5
      )
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
