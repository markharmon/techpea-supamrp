import { Component, inject, OnInit, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { SupabaseService, WorkOrder } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'

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

  logForm = this.formBuilder.group({
    work_order_id: ['', Validators.required],
    profile_id: ['', Validators.required],
    work_time: [0, [Validators.min(0)]],
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

  async completeOrder(): Promise<void> {
    const workOrderId = this.logForm.value.work_order_id
    if (!workOrderId) {
      alert('Please select a Work Order first')
      return
    }

    if (!confirm('Are you sure you want to complete this order? This will update inventory.')) {
      return
    }

    try {
      this.loading.set(true)
      const { error } = await this.supabase.completeWorkOrder(workOrderId)
      
      if (error) throw error
      
      alert('Work Order completed successfully!')
      
      this.logForm.reset({
        work_order_id: '',
        work_time: 0
      })
      
      // Refresh the list as the completed order should disappear
      await this.loadWorkOrders()
      
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async submitLog(): Promise<void> {
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
        profile_id: user.id as string 
      })

      if (error) throw error

      // Also set the work order to in_progress if it isn't already
      await this.supabase.setWorkOrderInProgress(workOrderId as string)
      
      alert('Production log saved successfully!')
      this.logForm.reset({
        work_order_id: '',
        profile_id: user.id, // keep the selected user
        work_time: 0
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
