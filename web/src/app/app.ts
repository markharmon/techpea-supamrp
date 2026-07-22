import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SupabaseService } from './services/supabase';
import { Session } from '@supabase/supabase-js';
import { MainMenu } from './core/main-menu/main-menu.component';
import { Header } from "./core/header/header.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MainMenu, Header],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected readonly title = signal('techpea-supabase-demo');
  session = signal<Session | null>(null);

  public ngOnInit(): void {
    this.supabase.authChanges((_, session) => {
      this.session.set(session);
      
      if (!session?.user) {
        this.router.navigate(['/login'])
      }
    })
  }
}
