import { vi } from 'vitest'

const query = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  returns: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: 'customer-1', name: 'Customer' }, error: null })
}

export const mocks = {
  query,
  from: vi.fn(() => query),
  rpc: vi.fn(() => query),
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn()
  }
}
