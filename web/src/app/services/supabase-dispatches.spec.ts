import { TestBed } from '@angular/core/testing'
import { DispatchHeader, SupabaseService } from './supabase'

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(), returns: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'dispatch-1' }, error: null })
  }
  return {
    query,
    from: vi.fn(() => query),
    rpc: vi.fn(() => query),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn()
    }
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc, auth: mocks.auth }))
}))

describe('Supabase dispatch operations', () => {
  let service: SupabaseService
  const header: DispatchHeader = {
    dispatch_date: '2026-10-31', customer_id: 'customer-1', packaging_intact: false,
    vehicle_clean_and_free_from_pests_and_contamination: true, product_temperature_celsius: 4
  }
  const lines = [{ item_batch_id: 'batch-1', quantity: 2.5 }]
  const version = '2026-10-31T10:00:00.123456Z'

  beforeEach(() => {
    vi.clearAllMocks()
    service = TestBed.inject(SupabaseService)
  })

  it('pages dispatches in a stable newest-first order with a total count', () => {
    service.getDispatches(2, 50)
    expect(mocks.from).toHaveBeenCalledWith('dispatches')
    expect(mocks.query.select).toHaveBeenCalledWith(expect.stringContaining('customer_name'), { count: 'exact' })
    expect(mocks.query.select).toHaveBeenCalledWith(
      expect.stringContaining('dispatch_item_batches ( quantity, item_batches ( item_id, items ( name, unit ) ) )'),
      { count: 'exact' }
    )
    expect(mocks.query.select).toHaveBeenCalledWith(
      expect.stringMatching(/created_by_name.*updated_by_name/), { count: 'exact' }
    )
    expect(mocks.query.order).toHaveBeenCalledWith('dispatch_date', { ascending: false })
    expect(mocks.query.order).toHaveBeenCalledWith('id')
    expect(mocks.query.range).toHaveBeenCalledWith(50, 99)
  })

  it('loads dispatch allocations with batches and their items', async () => {
    await service.getDispatch('dispatch-1')
    expect(mocks.query.select).toHaveBeenCalledWith(expect.stringContaining('dispatch_item_batches'))
    expect(mocks.query.select).toHaveBeenCalledWith(expect.stringContaining('items ( id, name, sku, unit )'))
    expect(mocks.query.select).toHaveBeenCalledWith(expect.stringMatching(/created_by_name.*updated_by_name/))
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'dispatch-1')
    expect(mocks.query.single).toHaveBeenCalled()
  })

  it('loads all item types with stock units and orders batches by expiry', () => {
    service.getDispatchItems()
    expect(mocks.from).toHaveBeenCalledWith('items')
    expect(mocks.query.select).toHaveBeenCalledWith('id, name, sku, unit')
    service.getDispatchBatches('item-1')
    expect(mocks.query.eq).toHaveBeenCalledWith('item_id', 'item-1')
    expect(mocks.query.gt).toHaveBeenCalledWith('quantity', 0)
    expect(mocks.query.order).toHaveBeenCalledWith('expiry_date', { ascending: true, nullsFirst: false })
  })

  it('creates a dispatch through the atomic RPC', async () => {
    await service.createDispatch(header, lines)
    expect(mocks.rpc).toHaveBeenCalledWith('create_dispatch', { p_dispatch: header, p_batches: lines })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('updates a dispatch with allocations and its exact loaded timestamp', async () => {
    await service.updateDispatch('dispatch-1', header, lines, version)
    expect(mocks.rpc).toHaveBeenCalledWith('update_dispatch', {
      p_dispatch_id: 'dispatch-1', p_dispatch: header, p_batches: lines, p_expected_updated_at: version
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('deletes through the stock-restoring RPC with a stale-write check', () => {
    service.deleteDispatch('dispatch-1', version)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_dispatch', {
      p_dispatch_id: 'dispatch-1', p_expected_updated_at: version
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
