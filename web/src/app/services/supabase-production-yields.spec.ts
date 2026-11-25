import { TestBed } from '@angular/core/testing'
import { SupabaseService } from './supabase'
import { mocks } from './supabase-test-mocks'

vi.mock('@supabase/supabase-js', async () => {
  const { mocks } = await import('./supabase-test-mocks')
  return { createClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc, auth: mocks.auth })) }
})

describe('Supabase production yields', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads batch counts, current batch sizes and stock units for the selected work order', () => {
    TestBed.inject(SupabaseService).getWorkOrderYieldItems('wo-1')
    expect(mocks.from).toHaveBeenCalledWith('work_order_items')
    expect(mocks.query.select).toHaveBeenCalledWith('id, quantity_planned, items ( name, unit, batch_size )')
    expect(mocks.query.eq).toHaveBeenCalledWith('work_order_id', 'wo-1')
    expect(mocks.query.order).toHaveBeenCalledWith('id')
  })

  it('sends final quantities and log details to the completion overload without client stock writes', () => {
    const yields = [{ work_order_item_id: 'woi-1', batch_number: 1, quantity: 0 }]
    TestBed.inject(SupabaseService).completeWorkOrderWithYields({
      work_order_id: 'wo-1', profile_id: 'user-1', work_time: 30, notes: 'Failed batch'
    }, yields)
    expect(mocks.rpc).toHaveBeenCalledWith('complete_work_order', {
      p_work_order_id: 'wo-1', p_yields: yields,
      p_log: { profile_id: 'user-1', work_time: 30, notes: 'Failed batch' }
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('preserves the existing standard-yield completion call', () => {
    TestBed.inject(SupabaseService).completeWorkOrder('wo-1')
    expect(mocks.rpc).toHaveBeenCalledWith('complete_work_order', { p_work_order_id: 'wo-1' })
  })
})
