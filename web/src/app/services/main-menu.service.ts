import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MainMenuService {
  // Signal to track menu state
  private _isOpen = signal(false);
  
  // Public readonly signal
  public readonly isOpen = this._isOpen.asReadonly();

  public open(): void {
    this._isOpen.set(true);
  }

  public close(): void {
    this._isOpen.set(false);
  }

  public toggle(): void {
    this._isOpen.set(!this._isOpen());
  }
}
