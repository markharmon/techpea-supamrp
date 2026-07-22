import { Directive, OnInit, OnDestroy, Host, Self, inject, input } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { Icon } from './icon/icon';

@Directive({
  selector: '[peaActiveIconColor]',
  standalone: true,
})
export class ActiveIconColorDirective implements OnInit, OnDestroy {
  peaActiveIconColor = input.required<string>();
  activeColor = input('var(--color-primary)');
  inactiveColor = input('var(--color-muted)');

  private sub?: Subscription;
  private router = inject(Router);

  constructor(@Host() private icon: Icon) {}

  ngOnInit() {
    this.updateColor();
    this.sub = this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) this.updateColor();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  private updateColor() {
    const isActive = this.router.isActive(this.peaActiveIconColor(), { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
    this.icon.setColor(isActive ? this.activeColor() : this.inactiveColor());
  }
}
