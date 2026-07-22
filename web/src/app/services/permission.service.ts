import { Injectable, inject, computed } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private supabase = inject(SupabaseService);

  /**
   * Signal-based: does user have a permission
   */
  public has = (permission: string) => computed(() => {
    const user = this.supabase.user();
    if (!user) return false;
    
    const userPermission = user.app_metadata['permission'];
    return userPermission === permission;
  });

  /**
   * Signal-based: does user have ANY of the given permissions (array of patterns)
   */
  public hasAny = (permissions: string[]) => computed(() => {
    const hasPermission = this.has;
    return permissions.some(p => hasPermission(p)());
  });

  /**
   * Signal-based: does user have ALL of the given permissions (array of patterns)
   */
  public hasAllPermissions = (permissions: string[]) => computed(() => {
    const hasPermission = this.has;
    return permissions.every(p => hasPermission(p)());
  });

  /**
   * Converts a wildcard pattern (e.g. "auth:*", "auth:tenants:*") to a RegExp
   * Keeping this helper if needed in future for more complex matching
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
    return new RegExp(regexStr);
  }
}

