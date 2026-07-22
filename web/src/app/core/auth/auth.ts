import { Component, signal } from '@angular/core'
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { SupabaseService } from '../../services/supabase'
import { Logo } from '../logo/logo'

@Component({
  imports: [ReactiveFormsModule, Logo],
  selector: 'app-auth',
  templateUrl: './auth.html',
  styleUrls: ['./auth.scss'],
})
export class AuthComponent {
  signInForm!: FormGroup

  constructor(
    private readonly supabase: SupabaseService,
    private readonly formBuilder: FormBuilder,
    private readonly router: Router
  ) {}

  loading = signal(false)
  isSignUp = signal(false)
  
  ngOnInit() {
    this.signInForm = this.formBuilder.group({
      email: '',
      password: '',
    })
  }

  async onSubmit(): Promise<void> {
    try {
      this.loading.set(true)
      const email = this.signInForm.value.email as string
      const password = this.signInForm.value.password as string
      
      let error;
      if (this.isSignUp()) {
        const { data, error: signUpError } = await this.supabase.signUp(email, password)
        error = signUpError
        
        // If signup is successful and we don't have a session, it means email verification is on.
        if (!error && !data.session) {
            alert('Check your email for the confirmation link!')
        } else if (!error && data.session) {
            await this.router.navigate(['/'])
        }
      } else {
        const { error: signInError } = await this.supabase.signIn(email, password)
        error = signInError
        if (!error) {
            await this.router.navigate(['/'])
        }
      }

      if (error) throw error
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.signInForm.reset()
      this.loading.set(false)
    }
  }

  toggleSignUp() {
    this.isSignUp.update(val => !val)
  }

  async forgotPassword() {
    const email = this.signInForm.value.email as string
    if (!email) {
      alert('Please enter your email address first.')
      return
    }
    
    try {
      this.loading.set(true)
      const { error } = await this.supabase.resetPassword(email)
      if (error) throw error
      alert('Password reset link sent! Check your email.')
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.loading.set(false)
    }
  }
}