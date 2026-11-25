import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { SupabaseService } from '../../services/supabase'
import { DispatchListComponent } from './dispatch-list'

const dispatch = {
  id: 'dispatch-1', dispatch_date: '2026-10-31', customer_id: 'customer-1', customer_name: 'Customer',
  packaging_intact: false, vehicle_clean_and_free_from_pests_and_contamination: true,
  product_temperature_celsius: 4.5, created_at: '2026-10-31T10:00:00Z', updated_at: '2026-10-31T10:00:00Z',
  created_by: 'user-1', created_by_name: 'Alice', updated_by: 'user-2', updated_by_name: 'Bob',
  dispatch_item_batches: [
    { quantity: 0.1, item_batches: { item_id: 'item-b', items: { name: 'Tomato Sauce', unit: 'kg' } } },
    { quantity: 0.2, item_batches: { item_id: 'item-b', items: { name: 'Tomato Sauce', unit: 'kg' } } },
    { quantity: 3, item_batches: { item_id: 'item-a', items: { name: 'Basil Pesto', unit: 'jars' } } }
  ]
}

describe('DispatchListComponent', () => {
  const permission = signal('staff')
  const supabase = {
    user: () => ({ app_metadata: { permission: permission() } }),
    getDispatches: vi.fn(),
    deleteDispatch: vi.fn()
  }

  beforeEach(async () => {
    permission.set('staff')
    supabase.getDispatches.mockReset().mockResolvedValue({ data: [dispatch], count: 1, error: null })
    supabase.deleteDispatch.mockReset().mockResolvedValue({ error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await TestBed.configureTestingModule({
      imports: [DispatchListComponent],
      providers: [provideRouter([]), { provide: SupabaseService, useValue: supabase }]
    }).compileComponents()
  })

  afterEach(() => vi.restoreAllMocks())

  async function render() {
    const fixture = TestBed.createComponent(DispatchListComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('lists dates, customers, safety checks and temperature with management actions', async () => {
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('Customer')
    expect(element.textContent).toContain('Oct 31, 2026')
    expect(element.textContent).toContain('4.5')
    expect(element.querySelector('a[href="/dispatches/new"]')).not.toBeNull()
    expect(element.querySelector('a[href="/dispatches/dispatch-1"]')?.textContent).toBe('Edit')
  })

  it('summarizes dispatched quantities per item, sorted by name, with batch counts', async () => {
    const fixture = await render()
    expect(fixture.componentInstance.itemSummaries().get('dispatch-1')).toEqual([
      { name: 'Basil Pesto', unit: 'jars', quantity: 3, batches: 1 },
      { name: 'Tomato Sauce', unit: 'kg', quantity: 0.3, batches: 2 }
    ])
    const items = [...fixture.nativeElement.querySelectorAll('.item-summary li')]
      .map((li: Element) => li.textContent?.replace(/\s+/g, ' ').trim())
    expect(items).toEqual(['Basil Pesto: 3 jars (1 batch)', 'Tomato Sauce: 0.3 kg (2 batches)'])
  })

  it('shows who last updated each dispatch and labels missing names', async () => {
    supabase.getDispatches.mockResolvedValue({
      data: [dispatch, { ...dispatch, id: 'dispatch-2', updated_by_name: null }],
      count: 2, error: null
    })
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    const headers = [...element.querySelectorAll('thead th')]
    const lastUpdateColumn = headers.findIndex(header => header.textContent?.trim() === 'Last update')
    expect(lastUpdateColumn).toBeGreaterThanOrEqual(0)
    const rows = [...element.querySelectorAll('tbody tr')]
    expect(rows[0].children[lastUpdateColumn].textContent?.trim()).toBe('Bob')
    expect(rows[1].children[lastUpdateColumn].textContent?.trim()).toBe('Unknown user')
  })

  it('labels missing item details and dispatches without lines', async () => {
    supabase.getDispatches.mockResolvedValue({
      data: [
        { ...dispatch, dispatch_item_batches: [{ quantity: 2, item_batches: null }] },
        { ...dispatch, id: 'dispatch-2', dispatch_item_batches: [] }
      ],
      count: 2, error: null
    })
    const fixture = await render()
    const text = fixture.nativeElement.textContent
    expect(text).toContain('Unknown item: 2')
    expect(text).toContain('No items')
  })

  it('lets viewers view details without create or delete actions', async () => {
    permission.set('viewer')
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('a[href="/dispatches/new"]')).toBeNull()
    expect(element.querySelector('a[href="/dispatches/dispatch-1"]')?.textContent).toBe('View')
    expect(element.textContent).not.toContain('Delete')
    await fixture.componentInstance.deleteDispatch(dispatch)
    expect(supabase.deleteDispatch).not.toHaveBeenCalled()
  })

  it('deletes only after confirmation and reloads the list', async () => {
    const component = (await render()).componentInstance
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await component.deleteDispatch(dispatch)
    expect(supabase.deleteDispatch).not.toHaveBeenCalled()
    await component.deleteDispatch(dispatch)
    expect(supabase.deleteDispatch).toHaveBeenCalledWith(dispatch.id, dispatch.updated_at)
    expect(supabase.getDispatches).toHaveBeenCalledTimes(2)
  })

  it('preserves the dispatch on deletion failure and offers reload', async () => {
    supabase.deleteDispatch.mockResolvedValue({ error: { message: 'Stale dispatch. Reload.' } })
    const fixture = await render()
    await fixture.componentInstance.deleteDispatch(dispatch)
    fixture.detectChanges()
    expect(fixture.componentInstance.dispatches()).toEqual([dispatch])
    expect(fixture.nativeElement.textContent).toContain('Stale dispatch. Reload.')
  })

  it('loads pages and moves back when deleting the only row on the last page', async () => {
    supabase.getDispatches.mockResolvedValue({ data: [dispatch], count: 51, error: null })
    const component = (await render()).componentInstance
    await component.loadDispatches(2)
    expect(component.page()).toBe(2)
    await component.deleteDispatch(dispatch)
    expect(supabase.getDispatches).toHaveBeenLastCalledWith(1, 50)
    expect(component.page()).toBe(1)
  })

  it('shows errors without an empty-success state', async () => {
    supabase.getDispatches.mockResolvedValue({ data: null, count: null, error: { message: 'Dispatch query failed' } })
    const fixture = await render()
    expect(fixture.nativeElement.textContent).toContain('Dispatch query failed')
    expect(fixture.nativeElement.textContent).not.toContain('No dispatches found.')
  })

  it('shows an empty state when no dispatches exist', async () => {
    supabase.getDispatches.mockResolvedValue({ data: [], count: 0, error: null })
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    const emptyCell = element.querySelector<HTMLTableCellElement>('tbody td')
    expect(emptyCell?.textContent?.trim()).toBe('No dispatches found.')
    expect(emptyCell?.colSpan).toBe(element.querySelectorAll('thead th').length)
  })
})
