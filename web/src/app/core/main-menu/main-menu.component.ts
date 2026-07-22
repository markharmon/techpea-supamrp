import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkMenuModule } from "@angular/cdk/menu";
import { RouterLink, Router, NavigationEnd, RouterLinkActive } from "@angular/router";
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { IconClose } from '../../shared/icons/icon-close/icon-close';
import { MainMenuService } from '../../services/main-menu.service';
import { PermissionService } from '../../services/permission.service';
import { SupabaseService } from '../../services/supabase';
import { Logo } from '../logo/logo';

@Component({
  selector: 'pea-main-menu',
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.scss'],
  standalone: true,
  imports: [CommonModule, IconClose, CdkMenuModule, RouterLink, RouterLinkActive, Logo]
})
export class MainMenu implements OnInit, OnDestroy {
  public mainMenuService = inject(MainMenuService);
  public permissions = inject(PermissionService);
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Listen for navigation events and close menu on successful navigation
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.mainMenuService.close();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public closeMenu(): void {
    this.mainMenuService.close();
  }

  public async signOut(): Promise<void> {
    await this.supabase.signOut();
    this.mainMenuService.close();
    await this.router.navigate(['/login']);
  }
}
