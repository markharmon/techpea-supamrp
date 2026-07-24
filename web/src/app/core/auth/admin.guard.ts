import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { SupabaseService } from '../../services/supabase'

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router)
  const supabase = inject(SupabaseService)

  const { data: { session } } = await supabase.getSession()

  if (!session) {
    return router.createUrlTree(['/login'])
  }

  const permission = session.user.app_metadata['permission']
  if (permission !== 'admin') {
    alert('Access denied: admin access is required.')
    return router.createUrlTree(['/dashboard'])
  }

  return true
}
