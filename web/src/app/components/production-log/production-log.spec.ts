import { TestBed } from '@angular/core/testing'
import { ProductionLogComponent } from './production-log'
import { SupabaseService } from '../../services/supabase'

describe('ProductionLogComponent final yields', () => {
  const supabase = {
    user: () => ({ id: 'user-1' }),
    getProfiles: vi.fn(),
    getWorkOrders: vi.fn(),
    getWorkOrderYieldItems: vi.fn(),
    completeWorkOrderWithYields: vi.fn(),
    addProductionLog: vi.fn(),
    completeWorkOrder: vi.fn(),
    getSession: vi.fn(),
    profile: vi.fn(),
    setWorkOrderInProgress: vi.fn()
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    supabase.getProfiles.mockResolvedValue({ data: [{ id: 'user-1', username: 'Operator' }], error: null })
    supabase.getWorkOrders.mockResolvedValue({
      data: [{ id: 'wo-1', reference_number: 1, description: 'Bread and cake' }], error: null
    })
    supabase.getWorkOrderYieldItems.mockResolvedValue({
      data: [
        { id: 'woi-1', quantity_planned: 2, items: { name: 'Bread', unit: 'kg', batch_size: 10 } },
        { id: 'woi-2', quantity_planned: 1, items: { name: 'Cake', unit: 'pcs', batch_size: 24 } }
      ], error: null
    })
    supabase.completeWorkOrderWithYields.mockResolvedValue({ error: null })
    supabase.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    supabase.profile.mockResolvedValue({ data: { id: 'user-1' }, error: null })
    supabase.addProductionLog.mockResolvedValue({ error: null })
    supabase.setWorkOrderInProgress.mockResolvedValue({ error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    await TestBed.configureTestingModule({
      imports: [ProductionLogComponent],
      providers: [{ provide: SupabaseService, useValue: supabase }]
    }).compileComponents()
  })

  afterEach(() => vi.restoreAllMocks())

  async function render() {
    const fixture = TestBed.createComponent(ProductionLogComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.componentInstance.logForm.patchValue({
      work_order_id: 'wo-1', profile_id: 'user-1', work_time: 35, notes: '  Final run  '
    })
    fixture.detectChanges()
    return fixture
  }

  it('opens prefilled per-batch yields without writing and locks the selected order', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    const element: HTMLElement = fixture.nativeElement
    element.querySelector<HTMLButtonElement>('button.secondary')!.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(supabase.getWorkOrderYieldItems).toHaveBeenCalledWith('wo-1')
    expect(component.yieldQuantities.getRawValue()).toEqual([10, 10, 24])
    expect(element.textContent).toContain('Bread - Batch 2 (kg)')
    expect(element.textContent).toContain('Cake - Batch 1 (pcs)')
    expect(element.querySelector<HTMLSelectElement>('#workOrder')?.matches(':disabled')).toBe(true)
    expect(supabase.addProductionLog).not.toHaveBeenCalled()
    expect(supabase.completeWorkOrderWithYields).not.toHaveBeenCalled()
  })

  it('sends individual fractional, zero and above-expected yields with the final log atomically', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.beginCompletion()
    component.yieldQuantities.setValue([8.5, 0, 26])
    await component.submitLog()
    expect(supabase.completeWorkOrderWithYields).toHaveBeenCalledWith({
      work_order_id: 'wo-1', profile_id: 'user-1', work_time: 35, notes: 'Final run'
    }, [
      { work_order_item_id: 'woi-1', batch_number: 1, quantity: 8.5 },
      { work_order_item_id: 'woi-1', batch_number: 2, quantity: 0 },
      { work_order_item_id: 'woi-2', batch_number: 1, quantity: 26 }
    ])
    expect(supabase.addProductionLog).not.toHaveBeenCalled()
    expect(supabase.completeWorkOrder).not.toHaveBeenCalled()
    expect(component.completing()).toBe(false)
    expect(component.logForm.value.work_order_id).toBe('')
    expect(component.logForm.value.profile_id).toBe('user-1')
    expect(supabase.getWorkOrders).toHaveBeenCalledTimes(2)
  })

  it.each([null, -1, NaN, Infinity])('rejects invalid yield %s before writing', async quantity => {
    const component = (await render()).componentInstance
    await component.beginCompletion()
    component.yieldQuantities.at(0).setValue(quantity)
    await component.completeOrder()
    expect(component.errorMessage()).toContain('finite, non-negative')
    expect(supabase.completeWorkOrderWithYields).not.toHaveBeenCalled()
    expect(component.completing()).toBe(true)
  })

  it('allows returning and cancelling confirmation without losing log details or writing', async () => {
    const component = (await render()).componentInstance
    await component.beginCompletion()
    vi.mocked(window.confirm).mockReturnValue(false)
    await component.completeOrder()
    expect(component.completing()).toBe(true)
    component.cancelCompletion()
    expect(component.completing()).toBe(false)
    expect(component.yieldQuantities.length).toBe(0)
    expect(component.logForm.value.work_time).toBe(35)
    expect(supabase.completeWorkOrderWithYields).not.toHaveBeenCalled()
  })

  it('retains entered yields on completion failure and permits a retry', async () => {
    const component = (await render()).componentInstance
    await component.beginCompletion()
    component.yieldQuantities.setValue([9, 8, 20])
    supabase.completeWorkOrderWithYields.mockResolvedValueOnce({
      error: { message: 'Planned batches have changed. Reopen final yields before completing' }
    })
    await component.completeOrder()
    expect(component.errorMessage()).toContain('Planned batches have changed')
    expect(component.yieldQuantities.getRawValue()).toEqual([9, 8, 20])
    expect(component.logForm.value.work_order_id).toBe('wo-1')
    expect(component.completing()).toBe(true)
    expect(window.alert).not.toHaveBeenCalled()
    await component.completeOrder()
    expect(supabase.completeWorkOrderWithYields).toHaveBeenCalledTimes(2)
    expect(component.completing()).toBe(false)
  })

  it('blocks duplicate completion while the RPC is pending', async () => {
    const component = (await render()).componentInstance
    await component.beginCompletion()
    let finish!: (value: { error: null }) => void
    supabase.completeWorkOrderWithYields.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = component.completeOrder()
    await component.completeOrder()
    expect(supabase.completeWorkOrderWithYields).toHaveBeenCalledTimes(1)
    finish({ error: null })
    await pending
  })

  it('surfaces batch loading failures without opening the completion step', async () => {
    const component = (await render()).componentInstance
    supabase.getWorkOrderYieldItems.mockResolvedValueOnce({ data: null, error: { message: 'Unable to fetch batches' } })
    await component.beginCompletion()
    expect(component.errorMessage()).toBe('Unable to fetch batches')
    expect(component.completing()).toBe(false)
    expect(component.loading()).toBe(false)
  })

  it.each([
    { data: [] },
    { data: [{ id: 'woi-1', quantity_planned: 2, items: null }] },
    { data: [{ id: 'woi-1', quantity_planned: 2, items: { name: 'Bread', unit: 'kg', batch_size: null } }] },
    { data: [{ id: 'woi-1', quantity_planned: 1.5, items: { name: 'Bread', unit: 'kg', batch_size: 10 } }] }
  ])('rejects missing or invalid planned batch data %#', async ({ data }) => {
    const component = (await render()).componentInstance
    supabase.getWorkOrderYieldItems.mockResolvedValueOnce({ data, error: null })
    await component.beginCompletion()
    expect(component.errorMessage()).not.toBe('')
    expect(component.completing()).toBe(false)
  })

  it('validates log details before opening final yields', async () => {
    const component = (await render()).componentInstance
    component.logForm.patchValue({ work_time: -1 })
    await component.beginCompletion()
    expect(component.errorMessage()).toContain('valid logged time')
    expect(supabase.getWorkOrderYieldItems).not.toHaveBeenCalled()
  })

  it('keeps ordinary Add as a time log without completing or requesting yields', async () => {
    const component = (await render()).componentInstance
    await component.submitLog()
    expect(supabase.addProductionLog).toHaveBeenCalledWith({
      work_order_id: 'wo-1', profile_id: 'user-1', work_time: 35, notes: 'Final run'
    })
    expect(supabase.setWorkOrderInProgress).toHaveBeenCalledWith('wo-1')
    expect(supabase.getWorkOrderYieldItems).not.toHaveBeenCalled()
    expect(supabase.completeWorkOrderWithYields).not.toHaveBeenCalled()
  })
})
