import { Component, forwardRef } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'pea-icon-profile',
  imports: [],
  templateUrl: './icon-profile.html',
  styleUrl: '../icon/icon.scss',
  providers: [{ provide: Icon, useExisting: forwardRef(() => IconProfile) }]
})
export class IconProfile extends Icon  {

}
