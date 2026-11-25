import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { SupabaseService } from '../../services/supabase'

export const permissionGuard = (allowedPermissions: string[]): CanActivateFn => async () => {
  const router = inject(Router)
  const supabase = inject(SupabaseService)

  const { data: { session } } = await supabase.getSession()

  if (!session) {
    return router.createUrlTree(['/login'])
  }

  const permission = session.user.app_metadata['permission']
  if (!allowedPermissions.includes(permission)) {
    alert(`Access denied: one of these permissions is required: ${allowedPermissions.join(', ')}.`)
    return router.createUrlTree(['/dashboard'])
  }

  return true
}

export const adminGuard: CanActivateFn = permissionGuard(['admin'])
