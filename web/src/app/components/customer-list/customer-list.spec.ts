import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { SupabaseService } from '../../services/supabase'
import { CustomerListComponent } from './customer-list'

describe('CustomerListComponent', () => {
  const permission = signal('staff')
  const supabase = {
    user: () => ({ app_metadata: { permission: permission() } }),
    getAllCustomers: vi.fn()
  }

  beforeEach(async () => {
    permission.set('staff')
    supabase.getAllCustomers.mockReset()
    supabase.getAllCustomers.mockResolvedValue({
      data: [{ id: 'customer-1', name: 'Example Customer' }],
      error: null
    })
    await TestBed.configureTestingModule({
      imports: [CustomerListComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents()
  })

  async function render() {
    const fixture = TestBed.createComponent(CustomerListComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('lists customers with create and edit links for staff', async () => {
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('Example Customer')
    expect(element.querySelector('a[href="/customers/new"]')).not.toBeNull()
    expect(element.querySelector('a[href="/customers/customer-1"]')).not.toBeNull()
  })

  it('shows customers without management actions for viewers', async () => {
    permission.set('viewer')
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('Example Customer')
    expect(element.querySelector('a')).toBeNull()
    expect(element.textContent).not.toContain('Actions')
  })

  it('allows admins and supervisors to manage customers', async () => {
    const fixture = await render()
    for (const role of ['admin', 'supervisor']) {
      permission.set(role)
      fixture.detectChanges()
      expect(fixture.componentInstance.canManage()).toBe(true)
    }
  })

  it('shows an empty state', async () => {
    supabase.getAllCustomers.mockResolvedValue({ data: [], error: null })
    const fixture = await render()
    expect(fixture.nativeElement.textContent).toContain('No customers found.')
  })

  it('shows plain Supabase errors instead of an empty-success state and supports retry', async () => {
    supabase.getAllCustomers.mockResolvedValueOnce({
      data: null, error: { message: 'Customer access failed' }
    })
    const fixture = await render()
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Customer access failed')
    expect(element.textContent).not.toContain('No customers found.')
    element.querySelector('button')?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(element.textContent).toContain('Example Customer')
    expect(element.querySelector('[role="alert"]')).toBeNull()
  })

  it('reports unexpected load failures and clears loading', async () => {
    supabase.getAllCustomers.mockRejectedValue('Network unavailable')
    const fixture = await render()
    expect(fixture.componentInstance.errorMessage()).toBe('Unable to load customers.')
    expect(fixture.componentInstance.loading()).toBe(false)
  })
})
