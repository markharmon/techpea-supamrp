import { Component, inject, OnInit, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { SupabaseService } from '../../services/supabase'

@Component({
  selector: 'app-customer',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingDirective, RouterLink],
  templateUrl: './customer.html',
  styleUrl: './customer.scss'
})
export class CustomerComponent implements OnInit {
  private fb = inject(FormBuilder)
  private supabase = inject(SupabaseService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  loading = signal(false)
  errorMessage = signal('')
  ready = signal(false)
  customerId: string | null = null
  isNew = true

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]]
  })

  async ngOnInit() {
    this.customerId = this.route.snapshot.paramMap.get('id')
    this.isNew = !this.customerId

    if (this.isNew) {
      this.ready.set(true)
    } else {
      await this.loadCustomer()
    }
  }

  async loadCustomer() {
    if (!this.customerId) return

    this.loading.set(true)
    this.ready.set(false)
    this.errorMessage.set('')

    try {
      const { data, error } = await this.supabase.getCustomer(this.customerId)
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Customer not found.')
      this.form.reset({ name: data.name })
      this.ready.set(true)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load customer.')
    } finally {
      this.loading.set(false)
    }
  }

  async save() {
    if (this.loading() || !this.ready()) return
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }

    this.loading.set(true)
    this.errorMessage.set('')

    try {
      const customer = { name: this.form.getRawValue().name.trim() }
      const { data, error } = this.customerId
        ? await this.supabase.updateCustomer(this.customerId, customer)
        : await this.supabase.createCustomer(customer)
      if (error) throw new Error(error.message)
      if (!data) throw new Error('The customer was not saved.')

      this.customerId = data.id
      this.isNew = false
      this.form.reset({ name: data.name })
      alert('Customer saved!')
      await this.router.navigate(['/customers'])
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to save customer.')
    } finally {
      this.loading.set(false)
    }
  }
}
