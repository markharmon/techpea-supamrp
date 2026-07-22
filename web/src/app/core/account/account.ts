import { Component, inject, OnInit, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { AuthSession } from '@supabase/supabase-js'
import { SupabaseService } from '../../services/supabase'
import { AvatarComponent } from '../avatar/avatar'
import { LoadingDirective } from '../../shared/loading/loading.directive'

@Component({
  imports: [ReactiveFormsModule, AvatarComponent, LoadingDirective],
  selector: 'app-account',
  templateUrl: './account.html',
  styleUrls: ['./account.scss']
})
export class AccountComponent implements OnInit {
  private formBuilder = inject(FormBuilder);
  private supabase = inject(SupabaseService);

  loading = signal(true);
  session = signal<AuthSession | null>(null);
  
  updateProfileForm = this.formBuilder.group({
    username: '',
    avatar_url: '',
  })

  get avatarUrl() {
    return this.updateProfileForm.value.avatar_url as string
  }
  async updateAvatar(event: string): Promise<void> {
    this.updateProfileForm.patchValue({
      avatar_url: event,
    })
    await this.updateProfile()
  }

  async ngOnInit(): Promise<void> {
    const { data } = await this.supabase.getSession()
    this.session.set(data.session)

    if (this.session()) {
      await this.getProfile()
    }
  }

  async getProfile() {
    try {
      this.loading.set(true)
      const user = this.session()?.user
      if (!user) return

      const { data: profile, error, status } = await this.supabase.profile(user)

      if (error && status !== 406) {
        throw error
      }

      if (profile) {
        const { username, avatar_url } = profile
        this.updateProfileForm.patchValue({
          username,
          avatar_url,
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

  async updateProfile(): Promise<void> {
    try {
      this.loading.set(true)
      const user = this.session()?.user
      if (!user) return

      const username = this.updateProfileForm.value.username as string
      const avatar_url = this.updateProfileForm.value.avatar_url as string

      const { error } = await this.supabase.updateProfile({
        id: user.id,
        username,
        avatar_url,
      })
      if (error) throw error
      alert('Profile updated!')
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async updatePassword(password: string) {
    if (!password) {
      alert('Please enter a new password.')
      return
    }
    
    try {
      this.loading.set(true)
      const { error } = await this.supabase.updateUser({ password })
      if (error) throw error
      alert('Password updated successfully!')
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }

  async signOut() {
    await this.supabase.signOut()
  }
}