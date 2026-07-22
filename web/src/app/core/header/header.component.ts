import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { map, Observable, shareReplay } from 'rxjs';
import { IconMenu } from "../../shared/icons/icon-menu/icon-menu";
import { MainMenuService } from '../../services/main-menu.service';
import { Logo } from "../logo/logo";

@Component({
  selector: 'pea-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [IconMenu, Logo]
})
export class Header {
  public mainMenu = inject(MainMenuService);

  private breakpointObserver = inject(BreakpointObserver);

  constructor() { }

  ngOnInit() {}

  public isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );
}
