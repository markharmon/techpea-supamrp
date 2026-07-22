import { Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'pea-icon',
  imports: [],
  template: '',
  styleUrl: './icon.scss',
  host: {
    '[class]': 'hostClass()',
    '[style.color]': '_color'
  }
})
export class Icon {
  public size = input(24);
  public color = input('var(--color-muted)');
  private _colorOverride = signal<string | null>(null);

  get _color() {
    return this._colorOverride() ?? this.color();
  }

  protected hostClass = computed(() => `icon size-${this.size()}`);

  setColor(color: string) {
    this._colorOverride.set(color);
  }

  clearOverrides() {
    this._colorOverride.set(null);
  }
}
