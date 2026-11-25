import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { DispatchBatch, DispatchDetail, DispatchItem, SupabaseService } from '../../services/supabase'
import { DispatchComponent } from './dispatch'

const dispatchItem: DispatchItem = { id: 'item-1', name: 'Bread', sku: 'BREAD', unit: 'kg' }
const otherItem: DispatchItem = { id: 'item-2', name: 'Cake', sku: 'CAKE', unit: 'pcs' }
const dispatchBatch: DispatchBatch = {
  id: 'batch-1', item_id: 'item-1', quantity: 10, reserved: 2,
  internal_code: 'B001', external_code: null, manufacture_date: '2026-10-01', expiry_date: '2026-11-01'
}
const savedDispatch: DispatchDetail = {
  id: 'dispatch-1', dispatch_date: '2026-10-31', customer_id: 'customer-1', customer_name: 'Original Customer',
  packaging_intact: false, vehicle_clean_and_free_from_pests_and_contamination: true,
  product_temperature_celsius: -4.5, created_at: '2026-10-31T10:00:00Z', updated_at: '2026-10-31T10:00:00Z',
  created_by: 'user-1', created_by_name: 'Alice', updated_by: 'user-2', updated_by_name: 'Bob',
  dispatch_item_batches: [{
    item_batch_id: 'batch-1', quantity: 3,
    item_batches: { ...dispatchBatch, items: dispatchItem }
  }]
}

describe('DispatchComponent', () => {
  const permission = signal('staff')
  const route = { snapshot: { paramMap: convertToParamMap({}) } }
  const supabase = {
    user: () => ({ app_metadata: { permission: permission() } }),
    getAllCustomers: vi.fn(),
    getDispatchItems: vi.fn(),
    getDispatchBatches: vi.fn(),
    getDispatch: vi.fn(),
    createDispatch: vi.fn(),
    updateDispatch: vi.fn(),
    deleteDispatch: vi.fn()
  }

  beforeEach(async () => {
    permission.set('staff')
    route.snapshot.paramMap = convertToParamMap({})
    Object.values(supabase).forEach(method => {
      if ('mockReset' in method) method.mockReset()
    })
    supabase.getAllCustomers.mockResolvedValue({ data: [{ id: 'customer-1', name: 'Renamed Customer' }], error: null })
    supabase.getDispatchItems.mockResolvedValue({ data: [dispatchItem, otherItem], error: null })
    supabase.getDispatchBatches.mockImplementation(async (id: string) => ({
      data: id === 'item-1'
        ? [dispatchBatch, { ...dispatchBatch, id: 'batch-2', quantity: 5, reserved: 0 }]
        : [{ ...dispatchBatch, id: 'batch-3', item_id: 'item-2', quantity: 7, reserved: 0 }],
      error: null
    }))
    supabase.getDispatch.mockResolvedValue({ data: savedDispatch, error: null })
    supabase.createDispatch.mockResolvedValue({ data: savedDispatch, error: null })
    supabase.updateDispatch.mockResolvedValue({ data: savedDispatch, error: null })
    supabase.deleteDispatch.mockResolvedValue({ error: null })
    vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await TestBed.configureTestingModule({
      imports: [DispatchComponent],
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
    const fixture = TestBed.createComponent(DispatchComponent)
    fixture.detectChanges()
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false))
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  function setHeader(component: DispatchComponent) {
    component.form.patchValue({
      dispatch_date: '2026-10-31', customer_id: 'customer-1', packaging_intact: false,
      vehicle_clean_and_free_from_pests_and_contamination: true, product_temperature_celsius: -4.5
    })
  }

  async function selectFirstItem(component: DispatchComponent) {
    const row = component.itemRows[0]
    row.controls.item_id.setValue('item-1')
    await component.selectItem(row)
    row.controls.batches.at(0).controls.quantity.setValue(2.5)
    return row
  }

  it('creates mixed items with multiple whole and partial batches in one RPC', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    setHeader(component)
    const first = await selectFirstItem(component)
    component.addBatch(first)
    first.controls.batches.at(1).controls.quantity.setValue(5)
    component.addItem()
    const second = component.itemRows[1]
    second.controls.item_id.setValue('item-2')
    await component.selectItem(second)
    second.controls.batches.at(0).controls.quantity.setValue(7)
    await component.save()
    expect(supabase.createDispatch).toHaveBeenCalledWith({
      dispatch_date: '2026-10-31', customer_id: 'customer-1', packaging_intact: false,
      vehicle_clean_and_free_from_pests_and_contamination: true, product_temperature_celsius: -4.5
    }, [
      { item_batch_id: 'batch-1', quantity: 2.5 },
      { item_batch_id: 'batch-2', quantity: 5 },
      { item_batch_id: 'batch-3', quantity: 7 }
    ])
    expect(component.total(first)).toBe(7.5)
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/dispatches'])
  })

  it('shows item search, batch codes, expiry and unreserved availability', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    const row = await selectFirstItem(component)
    row.controls.search.setValue('cake')
    expect(component.filteredItems(row).map(item => item.id)).toEqual(['item-1', 'item-2'])
    row.controls.search.setValue('BREAD')
    expect(component.filteredItems(row).map(item => item.id)).toEqual(['item-1'])
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('B001 - Exp: 2026-11-01 (avail: 8)')
    expect(component.available(row, row.controls.batches.at(0))).toBe(8)
  })

  it('filters customers by name and saves the clicked customer ID, not search text', async () => {
    supabase.getAllCustomers.mockResolvedValue({
      data: [
        { id: 'customer-1', name: 'Renamed Customer' },
        { id: 'customer-2', name: 'North Bakery' }
      ], error: null
    })
    const fixture = await render()
    const component = fixture.componentInstance
    setHeader(component)
    await selectFirstItem(component)
    const element: HTMLElement = fixture.nativeElement
    const input = element.querySelector<HTMLInputElement>('#dispatch-customer')!
    input.dispatchEvent(new FocusEvent('focus'))
    input.value = '  bAkE  '
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    const options = element.querySelectorAll<HTMLElement>('#dispatch-customer-list [role="option"]')
    expect(options.length).toBe(1)
    expect(options[0].textContent?.trim()).toBe('North Bakery')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(component.form.controls.customer_id.value).toBe('customer-1')
    const mouseDown = new MouseEvent('mousedown', { cancelable: true })
    options[0].dispatchEvent(mouseDown)
    expect(mouseDown.defaultPrevented).toBe(true)
    options[0].click()
    fixture.detectChanges()
    expect(input.value).toBe('North Bakery')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(component.form.controls.customer_id.dirty).toBe(true)
    await component.save()
    expect(supabase.createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'customer-2' }), expect.any(Array)
    )
  })

  it('supports customer keyboard navigation, wrapping and Enter without submitting', async () => {
    supabase.getAllCustomers.mockResolvedValue({
      data: [
        { id: 'customer-1', name: 'Renamed Customer' },
        { id: 'customer-2', name: 'North Bakery' }
      ], error: null
    })
    const fixture = await render()
    const component = fixture.componentInstance
    const element: HTMLElement = fixture.nativeElement
    const input = element.querySelector<HTMLInputElement>('#dispatch-customer')!
    input.dispatchEvent(new FocusEvent('focus'))
    fixture.detectChanges()
    element.querySelectorAll<HTMLElement>('#dispatch-customer-list [role="option"]').forEach(option => {
      option.scrollIntoView = vi.fn()
    })
    const key = (value: string) => {
      const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      fixture.detectChanges()
      expect(event.defaultPrevented).toBe(true)
    }
    key('ArrowUp')
    expect(input.getAttribute('aria-activedescendant')).toBe('dispatch-customer-option-1')
    key('ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBe('dispatch-customer-option-0')
    key('ArrowDown')
    key('Enter')
    expect(component.form.controls.customer_id.value).toBe('customer-2')
    expect(input.value).toBe('North Bakery')
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    expect(supabase.createDispatch).not.toHaveBeenCalled()
    input.click()
    fixture.detectChanges()
    expect(element.querySelectorAll('#dispatch-customer-list [role="option"]').length).toBe(2)
  })

  it('does not accept free text as a customer and shows empty search and required feedback', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    const element: HTMLElement = fixture.nativeElement
    const input = element.querySelector<HTMLInputElement>('#dispatch-customer')!
    input.value = 'Unknown Customer'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    expect(element.textContent).toContain('No matching customers')
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    input.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    expect(component.form.controls.customer_id.value).toBe('')
    expect(component.form.controls.customer_id.invalid).toBe(true)
    input.dispatchEvent(new FocusEvent('blur'))
    fixture.detectChanges()
    expect(input.value).toBe('')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(element.querySelector('#dispatch-customer-error')?.textContent).toContain('Select a customer')
    await component.save()
    expect(supabase.createDispatch).not.toHaveBeenCalled()
  })

  it('loads the current customer name and restores it after Escape, blur and reload', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    const fixture = await render()
    const component = fixture.componentInstance
    const element: HTMLElement = fixture.nativeElement
    const input = element.querySelector<HTMLInputElement>('#dispatch-customer')!
    expect(input.value).toBe('Renamed Customer')
    for (const dismiss of ['Escape', 'blur']) {
      input.dispatchEvent(new FocusEvent('focus'))
      input.value = 'No match'
      input.dispatchEvent(new Event('input'))
      input.dispatchEvent(dismiss === 'blur'
        ? new FocusEvent('blur')
        : new KeyboardEvent('keydown', { key: dismiss, bubbles: true, cancelable: true }))
      fixture.detectChanges()
      expect(input.value).toBe('Renamed Customer')
      expect(component.form.controls.customer_id.value).toBe('customer-1')
      expect(component.form.pristine).toBe(true)
    }
    component.chooseCustomer({ id: 'customer-1', name: 'Renamed Customer' })
    expect(component.form.pristine).toBe(true)
    component.customerSearch.setValue('Temporary search')
    component.openCustomerDropdown()
    await component.reload()
    fixture.detectChanges()
    expect(element.querySelector<HTMLInputElement>('#dispatch-customer')?.value).toBe('Renamed Customer')
    expect(component.customerDropdownOpen()).toBe(false)
    expect(component.customerName()).toBe('Original Customer')
  })

  it('keeps customer search empty and reports no customers when none are available', async () => {
    supabase.getAllCustomers.mockResolvedValue({ data: [], error: null })
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    element.querySelector<HTMLInputElement>('#dispatch-customer')!.dispatchEvent(new FocusEvent('focus'))
    fixture.detectChanges()
    expect(element.textContent).toContain('No customers found.')
    expect(element.textContent).toContain('No matching customers')
    expect(fixture.componentInstance.form.controls.customer_id.invalid).toBe(true)
  })

  it('shows the creator and last updater for saved dispatches only', async () => {
    const created = await render()
    expect(created.nativeElement.querySelector('.audit')).toBeNull()
    created.destroy()
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    const fixture = await render()
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form')
    expect(form.lastElementChild?.classList.contains('audit')).toBe(true)
    expect(form.querySelectorAll('.audit table tbody tr').length).toBe(2)
    const rows = [...form.querySelectorAll('.audit table tbody tr')]
    expect(rows[0].children[0].textContent?.trim()).toBe('Created')
    expect(rows[0].children[1].textContent?.trim()).toBe('Alice')
    expect(rows[1].children[0].textContent?.trim()).toBe('Last updated')
    expect(rows[1].children[1].textContent?.trim()).toBe('Bob')
  })

  it('labels missing audit names for saved dispatches', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    supabase.getDispatch.mockResolvedValue({
      data: { ...savedDispatch, created_by_name: null, updated_by_name: null }, error: null
    })
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    const rows = [...element.querySelectorAll('.audit table tbody tr')]
    expect(rows.map(row => row.children[1].textContent?.trim())).toEqual(['Unknown user', 'Unknown user'])
  })

  it('credits original dispatched quantities and sends the loaded version when editing', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    const fixture = await render()
    const component = fixture.componentInstance
    const row = component.itemRows[0]
    expect(component.available(row, row.controls.batches.at(0))).toBe(11)
    expect(component.customerName()).toBe('Original Customer')
    row.controls.batches.at(0).controls.quantity.setValue(10)
    await component.save()
    expect(supabase.updateDispatch).toHaveBeenCalledWith(
      'dispatch-1', expect.objectContaining({ packaging_intact: false }),
      [{ item_batch_id: 'batch-1', quantity: 10 }], savedDispatch.updated_at
    )
    expect(supabase.createDispatch).not.toHaveBeenCalled()
  })

  it('keeps fully dispatched batches selectable even when the stock query omits them', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    supabase.getDispatch.mockResolvedValue({
      data: {
        ...savedDispatch,
        dispatch_item_batches: [{
          ...savedDispatch.dispatch_item_batches[0],
          item_batches: { ...dispatchBatch, quantity: 0, reserved: 0, items: dispatchItem }
        }]
      }, error: null
    })
    supabase.getDispatchBatches.mockResolvedValue({ data: [], error: null })
    const fixture = await render()
    const component = fixture.componentInstance
    const row = component.itemRows[0]
    expect(component.options(row)).toHaveLength(1)
    expect(component.available(row, row.controls.batches.at(0))).toBe(3)
    await component.save()
    expect(supabase.updateDispatch).toHaveBeenCalled()
  })

  it('prevents invalid, zero, negative and nonfinite quantities', async () => {
    const component = (await render()).componentInstance
    setHeader(component)
    const row = await selectFirstItem(component)
    for (const quantity of [null, 0, -1, Infinity, NaN]) {
      row.controls.batches.at(0).controls.quantity.setValue(quantity)
      await component.save()
      expect(component.errorMessage()).not.toBe('')
    }
    expect(supabase.createDispatch).not.toHaveBeenCalled()
  })

  it('prevents quantities exceeding unreserved stock and duplicate batch selection', async () => {
    const component = (await render()).componentInstance
    setHeader(component)
    const row = await selectFirstItem(component)
    row.controls.batches.at(0).controls.quantity.setValue(9)
    await component.save()
    expect(component.errorMessage()).toContain('exceeds available stock')
    row.controls.batches.at(0).controls.quantity.setValue(1)
    component.addBatch(row)
    row.controls.batches.at(1).patchValue({ item_batch_id: 'batch-1', quantity: 1 })
    await component.save()
    expect(component.errorMessage()).toContain('only once')
    expect(supabase.createDispatch).not.toHaveBeenCalled()
  })

  it('requires explicit safety answers, temperature, items and batch rows', async () => {
    const component = (await render()).componentInstance
    await selectFirstItem(component)
    await component.save()
    expect(component.errorMessage()).toContain('Complete all dispatch details')
    setHeader(component)
    component.removeBatch(component.itemRows[0], 0)
    await component.save()
    expect(component.errorMessage()).toContain('Add a batch')
    component.removeItem(0)
    await component.save()
    expect(component.errorMessage()).toContain('at least one item')
    expect(supabase.createDispatch).not.toHaveBeenCalled()
  })

  it('changing an item discards the previous batch rows without writing to the database', async () => {
    const component = (await render()).componentInstance
    const row = await selectFirstItem(component)
    row.controls.item_id.setValue('item-2')
    await component.selectItem(row)
    expect(row.controls.batches.getRawValue()).toEqual([{ item_batch_id: 'batch-3', quantity: null }])
    expect(supabase.updateDispatch).not.toHaveBeenCalled()
    expect(supabase.createDispatch).not.toHaveBeenCalled()
    expect(supabase.deleteDispatch).not.toHaveBeenCalled()
  })

  it('shows stale-save errors and preserves the form for review', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    supabase.updateDispatch.mockResolvedValue({
      data: null, error: { message: 'Dispatch changed since it was loaded. Reload before saving.' }
    })
    const fixture = await render()
    await fixture.componentInstance.save()
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Reload before saving.')
    expect(fixture.componentInstance.itemRows[0].controls.batches.at(0).controls.quantity.value).toBe(3)
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled()
  })

  it('requires confirmation and deletes the saved dispatch with its version', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    const component = (await render()).componentInstance
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await component.deleteDispatch()
    expect(supabase.deleteDispatch).not.toHaveBeenCalled()
    await component.deleteDispatch()
    expect(supabase.deleteDispatch).toHaveBeenCalledWith('dispatch-1', savedDispatch.updated_at)
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('restored to stock'))
  })

  it('shows deletion failures without leaving the editor', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    supabase.deleteDispatch.mockResolvedValue({ error: { message: 'Dispatch changed. Reload.' } })
    const component = (await render()).componentInstance
    await component.deleteDispatch()
    expect(component.errorMessage()).toBe('Dispatch changed. Reload.')
    expect(component.ready()).toBe(true)
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled()
  })

  it('offers read-only details to viewers and refuses direct write handlers', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    permission.set('viewer')
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('fieldset')?.disabled).toBe(true)
    expect(element.querySelector<HTMLInputElement>('#dispatch-customer')?.matches(':disabled')).toBe(true)
    expect(element.querySelector<HTMLInputElement>('#dispatch-customer')?.value).toBe('Renamed Customer')
    expect(element.textContent).not.toContain('Delete Dispatch')
    expect(element.textContent).not.toContain('Add Batch')
    await fixture.componentInstance.save()
    await fixture.componentInstance.deleteDispatch()
    expect(supabase.updateDispatch).not.toHaveBeenCalled()
    expect(supabase.deleteDispatch).not.toHaveBeenCalled()
  })

  it('disables saving and deletion when loading fails', async () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'dispatch-1' })
    supabase.getDispatch.mockResolvedValue({ data: null, error: { message: 'Dispatch not found' } })
    const component = (await render()).componentInstance
    expect(component.ready()).toBe(false)
    await component.save()
    await component.deleteDispatch()
    expect(supabase.updateDispatch).not.toHaveBeenCalled()
    expect(supabase.deleteDispatch).not.toHaveBeenCalled()
  })

  it('surfaces batch query errors and prevents saving missing batch selections', async () => {
    const component = (await render()).componentInstance
    supabase.getDispatchBatches.mockResolvedValue({ data: null, error: { message: 'Batch query failed' } })
    setHeader(component)
    const row = component.itemRows[0]
    row.controls.item_id.setValue('item-1')
    await component.selectItem(row)
    expect(component.errorMessage()).toBe('Batch query failed')
    expect(component.batchesLoading()['item-1']).toBe(false)
    await component.save()
    expect(supabase.createDispatch).not.toHaveBeenCalled()
  })

  it('blocks duplicate submission and requires reload after a saved record cannot navigate', async () => {
    vi.mocked(TestBed.inject(Router).navigate).mockResolvedValue(false)
    const component = (await render()).componentInstance
    setHeader(component)
    await selectFirstItem(component)
    const saving = component.save()
    await component.save()
    await saving
    expect(supabase.createDispatch).toHaveBeenCalledTimes(1)
    expect(component.dispatchId).toBe('dispatch-1')
    expect(component.ready()).toBe(false)
    await component.save()
    expect(supabase.createDispatch).toHaveBeenCalledTimes(1)
  })
})
