import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { LoadingDirective } from '../../shared/loading/loading.directive';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, LoadingDirective],
  templateUrl: './user-list.html',
  styleUrls: ['./user-list.scss']
})
export class UserListComponent implements OnInit {
  private supabase = inject(SupabaseService);
  
  users = signal<any[]>([]);
  staffLevels = signal<any[]>([]);
  loading = signal(true);

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    
    const [profilesRes, levelsRes] = await Promise.all([
      this.supabase.getProfiles(),
      this.supabase.getStaffLevels()
    ]);

    if (profilesRes.error) {
      console.error('Error loading profiles:', profilesRes.error);
    } else {
        // Sort: Non-approved (no staff_level_id) first
        const sortedUsers = (profilesRes.data || []).sort((a: any, b: any) => {
            if (!a.staff_level_id && b.staff_level_id) return -1;
            if (a.staff_level_id && !b.staff_level_id) return 1;
            return 0; // Keep original order (by email)
        });
        this.users.set(sortedUsers);
    }

    if (levelsRes.error) {
        console.error('Error loading staff levels:', levelsRes.error);
    } else {
        this.staffLevels.set(levelsRes.data || []);
    }

    this.loading.set(false);
  }

  async updateRole(userId: string, event: Event) {
    const select = event.target as HTMLSelectElement;
    const newRoleId = select.value;

    if (!newRoleId) return;

    if (!confirm('Are you sure you want to assign this role? This will allow the user to access the application.')) {
        // Reset the select if they cancel? (Implementation details, might need a refresh)
        await this.loadData(); // Reload to reset UI state
        return;
    }

    const { error } = await this.supabase.updateProfileStaffLevel(userId, newRoleId);
    
    if (error) {
        alert('Error updating role: ' + error.message);
    } else {
        // Refresh the list to reflect changes and re-sort if necessary
        await this.loadData();
    }
  }

  getRoleBadgeClass(user: any): string {
    if (!user.staff_level) return 'warning';
    
    // Check permission_name (role key)
    const role = user.staff_level.permission_name;

    switch (role) {
        case 'admin': return 'danger';
        case 'supervisor': return 'warning';
        case 'staff': return 'success';
        case 'viewer': return 'info';
        default: return 'secondary';
    }
  }
}
