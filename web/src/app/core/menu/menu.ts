import { Component, inject } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'
import { SupabaseService } from '../../services/supabase'

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './menu.html',
  styleUrls: ['./menu.scss']
})
export class MenuComponent {
  private supabase = inject(SupabaseService)

  async signOut() {
    await this.supabase.signOut()
  }
}
