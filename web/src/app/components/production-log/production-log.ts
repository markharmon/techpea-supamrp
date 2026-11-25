import { Component, inject, OnInit, signal } from '@angular/core'
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { SupabaseService, WorkOrder } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'

interface YieldBatch {
  work_order_item_id: string
  batch_number: number
  name: string
  unit: string
  expected: number
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, LoadingDirective],
  selector: 'app-production-log',
  templateUrl: './production-log.html',
  styleUrls: ['./production-log.scss']
})
export class ProductionLogComponent implements OnInit {
  private formBuilder = inject(FormBuilder)
  private supabase = inject(SupabaseService)

  loading = signal(false)
  workOrders = signal<WorkOrder[]>([])
  profiles = signal<any[]>([])
  completing = signal(false)
  errorMessage = signal('')
  yieldBatches = signal<YieldBatch[]>([])
  yieldForm = this.formBuilder.group({
    quantities: new FormArray<FormControl<number | null>>([])
  })

  get yieldQuantities() {
    return this.yieldForm.controls.quantities
  }

  logForm = this.formBuilder.group({
    work_order_id: ['', Validators.required],
    profile_id: ['', Validators.required],
    work_time: [0, [Validators.min(0)]],
    notes: ['', Validators.maxLength(2000)],
  })

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadWorkOrders(),
      this.loadProfiles()
    ]);
  }

  async loadProfiles() {
    const { data } = await this.supabase.getProfiles();
    if (data) {
      this.profiles.set(data);
      if (this.supabase.user()) {
        this.logForm.patchValue({
          profile_id: this.supabase.user()!.id
        });
      }
    }
  }

  async loadWorkOrders() {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getWorkOrders()
      if (error) throw error
      if (data) {
        this.workOrders.set(data)
      }
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async beginCompletion(): Promise<void> {
    if (this.loading()) return
    this.errorMessage.set('')
    this.logForm.markAllAsTouched()
    const workOrderId = this.logForm.value.work_order_id
    if (this.logForm.invalid || !workOrderId || !this.logForm.value.profile_id) {
      this.errorMessage.set('Select a work order and user, and enter valid logged time and notes.')
      return
    }
    this.loading.set(true)
    try {
      const { data, error } = await this.supabase.getWorkOrderYieldItems(workOrderId)
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('No planned batches found for this work order.')
      const batches: YieldBatch[] = []
      for (const item of data) {
        if (!item.items || item.items.batch_size === null || !Number.isFinite(Number(item.items.batch_size))
          || Number(item.items.batch_size) <= 0 || !Number.isInteger(item.quantity_planned) || item.quantity_planned <= 0) {
          throw new Error('A work order item has an invalid batch size or planned batch count.')
        }
        for (let batch = 1; batch <= item.quantity_planned; batch++) {
          batches.push({
            work_order_item_id: item.id, batch_number: batch,
            name: item.items.name, unit: item.items.unit, expected: Number(item.items.batch_size)
          })
        }
      }
      this.yieldBatches.set(batches)
      this.yieldQuantities.clear()
      for (const batch of batches) {
        this.yieldQuantities.push(this.formBuilder.control<number | null>(
          batch.expected, [Validators.required, Validators.min(0)]
        ))
      }
      this.completing.set(true)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load planned batches.')
    } finally {
      this.loading.set(false)
    }
  }

  cancelCompletion() {
    if (this.loading()) return
    this.completing.set(false)
    this.yieldBatches.set([])
    this.yieldQuantities.clear()
    this.errorMessage.set('')
  }

  async completeOrder(): Promise<void> {
    if (this.loading() || !this.completing()) return
    this.errorMessage.set('')
    this.logForm.markAllAsTouched()
    this.yieldForm.markAllAsTouched()
    const { work_order_id: workOrderId, profile_id: profileId, work_time: workTime, notes } = this.logForm.getRawValue()
    if (this.logForm.invalid || !workOrderId || !profileId || workTime === null
      || !Number.isFinite(workTime) || workTime < 0) {
      this.errorMessage.set('Select a work order and user, and enter valid logged time and notes.')
      return
    }
    const quantities = this.yieldQuantities.getRawValue()
    if (this.yieldForm.invalid || !quantities.length || quantities.length !== this.yieldBatches().length
      || quantities.some(quantity => quantity === null || !Number.isFinite(quantity) || quantity < 0)) {
      this.errorMessage.set('Enter a finite, non-negative final yield for every batch.')
      return
    }

    if (!confirm('Are you sure you want to complete this order? This will update inventory.')) {
      return
    }

    try {
      this.loading.set(true)

      const yields = this.yieldBatches().map((batch, index) => {
        const quantity = quantities[index]
        if (quantity === null) throw new Error('Enter a final yield for every batch.')
        return { work_order_item_id: batch.work_order_item_id, batch_number: batch.batch_number, quantity }
      })
      const { error } = await this.supabase.completeWorkOrderWithYields({
        work_order_id: workOrderId, profile_id: profileId,
        work_time: workTime, notes: notes?.trim() || null
      }, yields)
      
      if (error) throw new Error(error.message)
      
      alert('Work Order completed successfully!')
      this.completing.set(false)
      this.yieldBatches.set([])
      this.yieldQuantities.clear()
      
      this.logForm.reset({
        work_order_id: '',
        profile_id: profileId,
        work_time: 0,
        notes: ''
      })
      
      // Refresh the list as the completed order should disappear
      await this.loadWorkOrders()
      
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to complete work order.')
    } finally {
      this.loading.set(false)
    }
  }

  async submitLog(): Promise<void> {
    if (this.completing()) {
      await this.completeOrder()
      return
    }
    if (this.loading()) return
    if (this.logForm.invalid) return

    try {
      this.loading.set(true)
      const session = await this.supabase.getSession()
      const user = session.data.session?.user

      if (!user) {
        throw new Error('User not authenticated')
      }

      // We need the profile id, but for now we might rely on RLS or trigger, 
      // however the schema says `profile_id` is required.
      // We need to fetch the profile id for the user first.
      const { data: profile } = await this.supabase.profile(user)
      if (!profile) {
          // If no profile, we can't really insert if the Constraint requires it. 
          // Let's assume we can get it.
           throw new Error('Profile not found')
      }

      // SupabaseService.profile() now selects id, username, and avatar_url.
      // The schema says `profile.id` is the primary key.
      // Usually profile.id IS the user.id in Supabase patterns (auth.users.id maps to profiles.id).
      // Let's assume profile_id = user.id.
      
      const formValue = this.logForm.value
      const workOrderId = formValue.work_order_id
      
      const { error } = await this.supabase.addProductionLog({
        work_order_id: workOrderId as string,
        work_time: formValue.work_time as number,
        profile_id: user.id as string,
        notes: formValue.notes?.trim() || null
      })

      if (error) throw error

      // Also set the work order to in_progress if it isn't already
      await this.supabase.setWorkOrderInProgress(workOrderId as string)
      
      alert('Production log saved successfully!')
      this.logForm.reset({
        work_order_id: '',
        profile_id: user.id, // keep the selected user
        work_time: 0,
        notes: ''
      })

    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }
}
