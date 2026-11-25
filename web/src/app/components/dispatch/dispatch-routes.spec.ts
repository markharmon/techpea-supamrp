import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { routes } from '../../app.routes'
import { SupabaseService } from '../../services/supabase'
import { DispatchListComponent } from '../dispatch-list/dispatch-list'
import { DispatchComponent } from './dispatch'

@Component({ template: 'Redirect destination' })
class RedirectComponent {}

describe('Dispatch routes', () => {
  let permission: string | null = 'staff'
  let signedIn = true
  const supabase = {
    user: () => ({ app_metadata: { permission } }),
    getSession: vi.fn(async () => ({
      data: { session: signedIn ? { user: { app_metadata: { permission } } } : null }
    })),
    signOut: vi.fn(),
    getDispatches: vi.fn(async () => ({ data: [], count: 0, error: null })),
    getAllCustomers: vi.fn(async () => ({ data: [], error: null })),
    getDispatchItems: vi.fn(async () => ({ data: [], error: null })),
    getDispatch: vi.fn(async () => ({
      data: {
        id: 'dispatch-1', customer_id: 'customer-1', customer_name: 'Customer',
        dispatch_date: '2026-10-31', packaging_intact: true,
        vehicle_clean_and_free_from_pests_and_contamination: true,
        product_temperature_celsius: 4, updated_at: '2026-10-31T10:00:00Z',
        dispatch_item_batches: []
      }, error: null
    }))
  }

  beforeEach(async () => {
    permission = 'staff'
    signedIn = true
    vi.clearAllMocks()
    vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const protectedRoutes = routes.find(route => route.children)
    if (!protectedRoutes) throw new Error('Protected application routes not found')
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            ...protectedRoutes,
            children: protectedRoutes.children?.filter(route => route.path?.startsWith('dispatches'))
          },
          { path: 'dashboard', component: RedirectComponent },
          { path: 'login', component: RedirectComponent }
        ]),
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents()
  })

  afterEach(() => vi.restoreAllMocks())

  it('allows approved viewers to list and view dispatches', async () => {
    permission = 'viewer'
    const harness = await RouterTestingHarness.create()
    const list = await harness.navigateByUrl('/dispatches', DispatchListComponent)
    expect(list.canManage()).toBe(false)
    const detail = await harness.navigateByUrl('/dispatches/dispatch-1', DispatchComponent)
    expect(detail.canManage()).toBe(false)
    expect(detail.dispatchId).toBe('dispatch-1')
  })

  it('allows staff, supervisors and admins to create dispatches using the new route', async () => {
    const harness = await RouterTestingHarness.create()
    for (const role of ['staff', 'supervisor', 'admin']) {
      permission = role
      const component = await harness.navigateByUrl('/dispatches/new', DispatchComponent)
      expect(component.isNew).toBe(true)
      expect(component.canManage()).toBe(true)
      await harness.navigateByUrl('/dashboard', RedirectComponent)
    }
    expect(supabase.getDispatch).not.toHaveBeenCalled()
  })

  it('denies viewers access to creation', async () => {
    permission = 'viewer'
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/dispatches/new', RedirectComponent)
    expect(TestBed.inject(Router).url).toBe('/dashboard')
  })

  it('redirects signed-out visitors to login before fetching dispatch data', async () => {
    signedIn = false
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/dispatches/dispatch-1', RedirectComponent)
    expect(TestBed.inject(Router).url).toBe('/login')
    expect(supabase.getDispatch).not.toHaveBeenCalled()
  })

  it('denies unapproved users access to dispatch data', async () => {
    permission = null
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/dispatches', RedirectComponent)
    expect(TestBed.inject(Router).url).toBe('/login')
    expect(supabase.signOut).toHaveBeenCalled()
    expect(supabase.getDispatches).not.toHaveBeenCalled()
  })
})
