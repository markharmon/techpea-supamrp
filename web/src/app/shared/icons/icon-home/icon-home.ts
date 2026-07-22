import { Component, forwardRef } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'pea-icon-home',
  imports: [],
  templateUrl: './icon-home.html',
  styleUrl: '../icon/icon.scss',
  providers: [{ provide: Icon, useExisting: forwardRef(() => IconHome) }]
})
export class IconHome extends Icon {
}
