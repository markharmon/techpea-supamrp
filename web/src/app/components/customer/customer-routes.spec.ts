import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { routes } from '../../app.routes'
import { SupabaseService } from '../../services/supabase'
import { CustomerListComponent } from '../customer-list/customer-list'
import { CustomerComponent } from './customer'

@Component({ template: 'Redirect destination' })
class RedirectComponent {}

describe('Customer routes', () => {
  let permission: string | null = 'staff'
  let signedIn = true
  const supabase = {
    user: () => ({ app_metadata: { permission } }),
    getSession: vi.fn(async () => ({
      data: { session: signedIn ? { user: { app_metadata: { permission } } } : null }
    })),
    signOut: vi.fn(),
    getAllCustomers: vi.fn(async () => ({ data: [], error: null })),
    getCustomer: vi.fn(async () => ({
      data: { id: 'customer-1', name: 'Existing Customer' }, error: null
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
            children: protectedRoutes.children?.filter(route => route.path?.startsWith('customers'))
          },
          { path: 'dashboard', component: RedirectComponent },
          { path: 'login', component: RedirectComponent }
        ]),
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents()
  })

  afterEach(() => vi.restoreAllMocks())

  it('allows approved viewers to list customers', async () => {
    permission = 'viewer'
    const harness = await RouterTestingHarness.create()
    const component = await harness.navigateByUrl('/customers', CustomerListComponent)
    expect(component.canManage()).toBe(false)
  })

  it('treats new as creation rather than a customer ID', async () => {
    const harness = await RouterTestingHarness.create()
    const component = await harness.navigateByUrl('/customers/new', CustomerComponent)
    expect(component.isNew).toBe(true)
    expect(supabase.getCustomer).not.toHaveBeenCalled()
  })

  it('allows staff, supervisors and admins to open customer editing', async () => {
    const harness = await RouterTestingHarness.create()
    for (const role of ['staff', 'supervisor', 'admin']) {
      permission = role
      const component = await harness.navigateByUrl('/customers/customer-1', CustomerComponent)
      expect(component.customerId).toBe('customer-1')
      await harness.navigateByUrl('/dashboard', RedirectComponent)
    }
  })

  it('denies viewer access to create and edit URLs', async () => {
    permission = 'viewer'
    const harness = await RouterTestingHarness.create()
    for (const url of ['/customers/new', '/customers/customer-1']) {
      await harness.navigateByUrl(url, RedirectComponent)
      expect(TestBed.inject(Router).url).toBe('/dashboard')
    }
    expect(supabase.getCustomer).not.toHaveBeenCalled()
  })

  it('redirects signed-out visitors to login', async () => {
    signedIn = false
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/customers', RedirectComponent)
    expect(TestBed.inject(Router).url).toBe('/login')
    expect(supabase.getAllCustomers).not.toHaveBeenCalled()
  })

  it('denies unapproved users before fetching business data', async () => {
    permission = null
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/customers', RedirectComponent)
    expect(TestBed.inject(Router).url).toBe('/login')
    expect(supabase.signOut).toHaveBeenCalled()
    expect(supabase.getAllCustomers).not.toHaveBeenCalled()
  })
})
