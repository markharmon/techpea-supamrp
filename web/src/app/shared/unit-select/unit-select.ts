import { Component, forwardRef, input, signal } from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'

export const UNIT_OPTIONS = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'ml', label: 'Milliliters (ml)' },
  { value: 'pcs', label: 'Pieces (pcs)' }
] as const

@Component({
  selector: 'app-unit-select',
  standalone: true,
  templateUrl: './unit-select.html',
  styleUrl: './unit-select.scss',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UnitSelectComponent),
    multi: true
  }]
})
export class UnitSelectComponent implements ControlValueAccessor {
  /** Optional id for the inner select, for label association. */
  selectId = input('')
  /** Text for an empty option. When unset, no empty option is shown. */
  placeholder = input('')

  units = UNIT_OPTIONS
  value = signal('')
  disabled = signal(false)

  private onChange: (value: string) => void = () => {}
  onTouched: () => void = () => {}

  writeValue(value: string | null) {
    this.value.set(value ?? '')
  }

  registerOnChange(fn: (value: string) => void) {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void) {
    this.onTouched = fn
  }

  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled)
  }

  select(event: Event) {
    const value = (event.target as HTMLSelectElement).value
    this.value.set(value)
    this.onChange(value)
  }
}
