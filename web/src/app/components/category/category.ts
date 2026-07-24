import { Component, inject, OnInit, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { SupabaseService } from '../../services/supabase'

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingDirective, RouterLink],
  templateUrl: './category.html',
  styleUrl: './category.scss'
})
export class CategoryComponent implements OnInit {
  private fb = inject(FormBuilder)
  private supabase = inject(SupabaseService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  loading = signal(false)
  categoryId: string | null = null
  isNew = true

  form = this.fb.group({
    name: ['', Validators.required]
  })

  async ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('id')
    this.isNew = !this.categoryId

    if (!this.isNew && this.categoryId) {
      await this.loadCategory(this.categoryId)
    }
  }

  async loadCategory(id: string) {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getCategory(id)
      if (error) throw error

      if (data) {
        this.form.patchValue({
          name: data.name,
        })
      }
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async save() {
    if (this.form.invalid) {
      return
    }

    try {
      this.loading.set(true)
      const formValue = this.form.value
      const payload: { id?: string; name?: string | null } = {
        name: formValue.name,
      }

      if (!this.isNew && this.categoryId) {
        payload.id = this.categoryId
      }

      const { error } = await this.supabase.upsertCategory(payload)
      if (error) throw error

      alert('Category saved!')
      await this.router.navigate(['/categories'])
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }
}
