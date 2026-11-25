import { TestBed } from '@angular/core/testing'
import { SupabaseService } from './supabase'

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returns: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'customer-1', name: 'Customer' }, error: null })
  }
  return {
    query,
    from: vi.fn(() => query),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn()
    }
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.from, auth: mocks.auth }))
}))

describe('Supabase customer operations', () => {
  let service: SupabaseService

  beforeEach(() => {
    vi.clearAllMocks()
    service = TestBed.inject(SupabaseService)
  })

  it('selects customer IDs and names ordered by name', () => {
    service.getAllCustomers()
    expect(mocks.from).toHaveBeenCalledWith('customers')
    expect(mocks.query.select).toHaveBeenCalledWith('id, name')
    expect(mocks.query.order).toHaveBeenCalledWith('name')
  })

  it('loads exactly one customer by ID', async () => {
    await service.getCustomer('customer-1')
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'customer-1')
    expect(mocks.query.single).toHaveBeenCalled()
  })

  it('inserts a new customer and selects the saved record', async () => {
    await service.createCustomer({ name: 'Customer' })
    expect(mocks.query.insert).toHaveBeenCalledWith({
      name: 'Customer', updated_at: expect.any(Date)
    })
    expect(mocks.query.select).toHaveBeenCalledWith('id, name')
    expect(mocks.query.single).toHaveBeenCalled()
  })

  it('updates only the requested customer and returns the saved record', async () => {
    await service.updateCustomer('customer-1', { name: 'Renamed Customer' })
    expect(mocks.query.update).toHaveBeenCalledWith({
      name: 'Renamed Customer', updated_at: expect.any(Date)
    })
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'customer-1')
    expect(mocks.query.insert).not.toHaveBeenCalled()
    expect(mocks.query.single).toHaveBeenCalled()
  })
})
