import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { SupabaseService } from '../../services/supabase'
import { CustomerComponent } from './customer'

describe('CustomerComponent', () => {
  const route = { snapshot: { paramMap: convertToParamMap({}) } }
  const supabase = {
    getCustomer: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn()
  }

  beforeEach(async () => {
    route.snapshot.paramMap = convertToParamMap({})
    supabase.getCustomer.mockReset().mockResolvedValue({
      data: { id: 'customer-1', name: 'Existing Customer' }, error: null
    })
    supabase.createCustomer.mockReset().mockResolvedValue({
      data: { id: 'customer-1', name: 'New Customer' }, error: null
    })
    supabase.updateCustomer.mockReset().mockResolvedValue({
      data: { id: 'customer-1', name: 'Renamed Customer' }, error: null
    })
    vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    await TestBed.configureTestingModule({
      imports: [CustomerComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents()
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
  })

  afterEach(() => vi.restoreAllMocks())

  async function render() {
    const fixture = TestBed.createComponent(CustomerComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('creates a customer with a trimmed name and returns to the list', async () => {
    const fixture = await render()
    expect(fixture.nativeElement.textContent).toContain('New Customer')
    fixture.componentInstance.form.controls.name.setValue('  New Customer  ')
    await fixture.componentInstance.save()
    expect(supabase.createCustomer).toHaveBeenCalledWith({ name: 'New Customer' })
    expect(supabase.updateCustomer).not.toHaveBeenCalled()
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/customers'])
    expect(window.alert).toHaveBeenCalledWith('Customer saved!')
  })

  it('loads and updates an existing customer without inserting a replacement', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'customer-1' })
    const fixture = await render()
    expect(supabase.getCustomer).toHaveBeenCalledWith('customer-1')
    expect(fixture.componentInstance.form.controls.name.value).toBe('Existing Customer')
    expect(fixture.nativeElement.textContent).toContain('Edit Customer')
    fixture.componentInstance.form.controls.name.setValue(' Renamed Customer ')
    await fixture.componentInstance.save()
    expect(supabase.updateCustomer).toHaveBeenCalledWith('customer-1', { name: 'Renamed Customer' })
    expect(supabase.createCustomer).not.toHaveBeenCalled()
  })

  it('rejects empty and whitespace-only names with visible validation', async () => {
    const fixture = await render()
    for (const name of ['', '   ', '\t\n']) {
      fixture.componentInstance.form.controls.name.setValue(name)
      await fixture.componentInstance.save()
      fixture.detectChanges()
      expect(fixture.componentInstance.form.invalid).toBe(true)
      expect(fixture.nativeElement.textContent).toContain('Enter a customer name.')
    }
    expect(supabase.createCustomer).not.toHaveBeenCalled()
  })

  it('preserves input and shows duplicate-name errors without navigating', async () => {
    supabase.createCustomer.mockResolvedValue({
      data: null, error: { message: 'Customer name already exists' }
    })
    const fixture = await render()
    fixture.componentInstance.form.controls.name.setValue('Duplicate')
    await fixture.componentInstance.save()
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Customer name already exists')
    expect(fixture.componentInstance.form.controls.name.value).toBe('Duplicate')
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled()
    expect(window.alert).not.toHaveBeenCalled()
  })

  it('disables saving after a failed load and allows retry', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'customer-1' })
    supabase.getCustomer.mockResolvedValueOnce({
      data: null, error: { message: 'Customer not found' }
    })
    const fixture = await render()
    expect(fixture.componentInstance.ready()).toBe(false)
    fixture.componentInstance.form.controls.name.setValue('Do not save')
    await fixture.componentInstance.save()
    expect(supabase.updateCustomer).not.toHaveBeenCalled()
    await fixture.componentInstance.loadCustomer()
    expect(fixture.componentInstance.ready()).toBe(true)
    expect(fixture.componentInstance.form.controls.name.value).toBe('Existing Customer')
  })

  it('does not recreate an edited customer that was deleted before saving', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'customer-1' })
    supabase.updateCustomer.mockResolvedValue({ data: null, error: { message: 'No row found' } })
    const fixture = await render()
    fixture.componentInstance.form.controls.name.setValue('Renamed Customer')
    await fixture.componentInstance.save()
    expect(fixture.componentInstance.errorMessage()).toBe('No row found')
    expect(supabase.createCustomer).not.toHaveBeenCalled()
  })

  it('ignores repeated submits while a save is in progress', async () => {
    const fixture = await render()
    fixture.componentInstance.form.controls.name.setValue('New Customer')
    const first = fixture.componentInstance.save()
    await fixture.componentInstance.save()
    await first
    expect(supabase.createCustomer).toHaveBeenCalledTimes(1)
  })

  it('reports thrown failures and restores the loading state', async () => {
    supabase.createCustomer.mockRejectedValue(new Error('Network unavailable'))
    const fixture = await render()
    fixture.componentInstance.form.controls.name.setValue('New Customer')
    await fixture.componentInstance.save()
    expect(fixture.componentInstance.errorMessage()).toBe('Network unavailable')
    expect(fixture.componentInstance.loading()).toBe(false)
  })

  it('retains the saved ID if navigation fails so retry cannot duplicate an insert', async () => {
    vi.mocked(TestBed.inject(Router).navigate).mockRejectedValue(new Error('Navigation failed'))
    const fixture = await render()
    fixture.componentInstance.form.controls.name.setValue('New Customer')
    await fixture.componentInstance.save()
    expect(fixture.componentInstance.customerId).toBe('customer-1')
    await fixture.componentInstance.save()
    expect(supabase.createCustomer).toHaveBeenCalledTimes(1)
    expect(supabase.updateCustomer).toHaveBeenCalledTimes(1)
  })
})
