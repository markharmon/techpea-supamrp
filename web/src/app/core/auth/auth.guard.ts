import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SupabaseService } from '../../services/supabase';

export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  // 1. Check for active session
  const { data: { session } } = await supabase.getSession();

  if (!session) {
    return router.createUrlTree(['/login']);
  }

  // 2. Check for "Approved" status (existence of a permission role)
  // New users without a staff_level will have no 'permission' in app_metadata
  const permission = session.user.app_metadata['permission'];
  
  if (!permission) {
     // User is logged in but has no permission (not approved)
     alert('Access Denied: Your account is pending approval from an administrator.');
     // Optionally sign them out so they don't get stuck in a weird loop
     await supabase.signOut(); 
     return router.createUrlTree(['/login']);
  }

  return true;
};
