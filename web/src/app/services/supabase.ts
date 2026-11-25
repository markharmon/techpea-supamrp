import { Injectable, signal } from '@angular/core'
import {
  AuthChangeEvent,
  AuthSession,
  createClient,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js'
import { environment } from '../../environments/environment'

export interface Profile {
  id?: string
  username?: string
  avatar_url?: string
}

export interface Customer {
  id: string
  name: string
}

export interface DispatchHeader {
  dispatch_date: string
  customer_id: string
  packaging_intact: boolean
  vehicle_clean_and_free_from_pests_and_contamination: boolean
  product_temperature_celsius: number
}

export interface Dispatch extends DispatchHeader {
  id: string
  customer_name: string
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
  updated_by: string | null
  updated_by_name: string | null
}

export interface DispatchItem {
  id: string
  name: string
  sku: string | null
  unit: string
}

export interface DispatchBatch {
  id: string
  item_id: string
  quantity: number
  reserved: number
  internal_code: string | null
  external_code: string | null
  manufacture_date: string | null
  expiry_date: string | null
}

export interface DispatchAllocation {
  item_batch_id: string
  quantity: number
}

export interface DispatchDetail extends Dispatch {
  dispatch_item_batches: (DispatchAllocation & {
    item_batches: DispatchBatch & { items: DispatchItem }
  })[]
}

export interface DispatchListRow extends Dispatch {
  dispatch_item_batches: {
    quantity: number
    item_batches: {
      item_id: string
      items: Pick<DispatchItem, 'name' | 'unit'> | null
    } | null
  }[]
}

export interface Item {
    id: string
    name: string
    sku?: string
    is_manufactured?: boolean
}

export interface WorkOrder {
    id: string
    reference_number: number
    description: string
}

export interface WorkOrderDetail {
  id?: string
  reference_number?: number
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  notes?: string
  due_date?: string
}

export interface WorkOrderItem {
  id?: string
  work_order_id?: string
  item_id: string
  quantity_planned: number
}

export interface ItemBatch {
  id?: string
  item_id: string
  manufacture_date?: string | null
  expiry_date?: string | null
  quantity: number
  reserved?: number
  external_code?: string | null
  internal_code?: string | null
}

export interface ProductionLog {
    work_order_id: string,
    work_time: number,
  profile_id?: string,
  notes?: string | null
}

export interface WorkOrderBatchYield {
  work_order_item_id: string
  batch_number: number
  quantity: number
}

export interface WorkOrderYieldItem {
  id: string
  quantity_planned: number
  items: { name: string, unit: string, batch_size: number | null } | null
}

export interface WorkOrderLog {
  id: string
  work_time: number
  notes?: string | null
  created_at: string
  profile_id?: string | null
  profiles?: {
    username?: string | null
    email?: string | null
  } | null
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient
  _session: AuthSession | null = null
  public user = signal<User | null>(null)

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey)
    
    this.supabase.auth.getSession().then(({ data }) => {
      this._session = data.session
      this.user.set(data.session?.user ?? null)
    })

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session = session
      this.user.set(session?.user ?? null)
    })
  }

  get session() {
    return this._session
  }

  getSession() {
    return this.supabase.auth.getSession()
  }

  profile(user: User) {
    return this.supabase
      .from('profiles')
      .select(`id, username, avatar_url`)
      .eq('id', user.id)
      .single()
  }

  authChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback)
  }

  signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({
      email,
      password,
    })
  }

  signUp(email: string, password: string) {
    return this.supabase.auth.signUp({
      email,
      password,
    })
  }

  resetPassword(email: string) {
    return this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
  }

  updateUser(attributes: any) {
    return this.supabase.auth.updateUser(attributes)
  }

  signOut() {
    return this.supabase.auth.signOut()
  }

  updateProfile(profile: Profile) {
    const update = {
      ...profile,
      updated_at: new Date(),
    }

    return this.supabase.from('profiles').upsert(update)
  }

  downLoadImage(path: string) {
    return this.supabase.storage.from('avatars').download(path)
  }

  uploadAvatar(filePath: string, file: File) {
    return this.supabase.storage.from('avatars').upload(filePath, file)
  }
  
  getItemCategories() {
    return this.supabase.from('item_categories').select('*').order('name')
  }

  getAllCategories() {
    return this.supabase.from('item_categories').select('*').order('name')
  }

  getCategory(id: string) {
    return this.supabase
      .from('item_categories')
      .select('*')
      .eq('id', id)
      .single()
  }

  upsertCategory(category: any) {
    const payload = {
      ...category,
      updated_at: new Date(),
    }

    return this.supabase.from('item_categories').upsert(payload).select().single()
  }

  deleteCategory(id: string) {
    return this.supabase
      .from('item_categories')
      .delete()
      .eq('id', id)
  }

  getAllCustomers() {
    return this.supabase
      .from('customers')
      .select('id, name')
      .order('name')
      .returns<Customer[]>()
  }

  getCustomer(id: string) {
    return this.supabase
      .from('customers')
      .select('id, name')
      .eq('id', id)
      .returns<Customer[]>()
      .single()
  }

  createCustomer(customer: Pick<Customer, 'name'>) {
    return this.supabase
      .from('customers')
      .insert({ ...customer, updated_at: new Date() })
      .select('id, name')
      .returns<Customer[]>()
      .single()
  }

  updateCustomer(id: string, customer: Pick<Customer, 'name'>) {
    return this.supabase
      .from('customers')
      .update({ ...customer, updated_at: new Date() })
      .eq('id', id)
      .select('id, name')
      .returns<Customer[]>()
      .single()
  }

  getVendors() {
    return this.supabase.from('vendors').select('*').order('name')
  }

  getDispatches(page = 1, pageSize = 50) {
    return this.supabase
      .from('dispatches')
      .select(`
        id, dispatch_date, customer_id, customer_name, packaging_intact,
        vehicle_clean_and_free_from_pests_and_contamination, product_temperature_celsius,
        created_at, updated_at, created_by, created_by_name, updated_by, updated_by_name,
        dispatch_item_batches ( quantity, item_batches ( item_id, items ( name, unit ) ) )
      `, { count: 'exact' })
      .order('dispatch_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * pageSize, page * pageSize - 1)
      .returns<DispatchListRow[]>()
  }

  getDispatch(id: string) {
    return this.supabase
      .from('dispatches')
      .select(`
        id, dispatch_date, customer_id, customer_name, packaging_intact,
        vehicle_clean_and_free_from_pests_and_contamination, product_temperature_celsius,
        created_at, updated_at, created_by, created_by_name, updated_by, updated_by_name,
        dispatch_item_batches (
          item_batch_id, quantity,
          item_batches (
            id, item_id, quantity, reserved, internal_code, external_code, manufacture_date, expiry_date,
            items ( id, name, sku, unit )
          )
        )
      `)
      .eq('id', id)
      .returns<DispatchDetail[]>()
      .single()
  }

  getDispatchItems() {
    return this.supabase.from('items').select('id, name, sku, unit').order('name').returns<DispatchItem[]>()
  }

  getDispatchBatches(itemId: string) {
    return this.supabase
      .from('item_batches')
      .select('id, item_id, quantity, reserved, internal_code, external_code, manufacture_date, expiry_date')
      .eq('item_id', itemId)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('created_at')
      .returns<DispatchBatch[]>()
  }

  createDispatch(dispatch: DispatchHeader, batches: DispatchAllocation[]) {
    return this.supabase.rpc('create_dispatch', {
      p_dispatch: dispatch, p_batches: batches
    }).returns<Dispatch[]>().single()
  }

  updateDispatch(id: string, dispatch: DispatchHeader, batches: DispatchAllocation[], updatedAt: string) {
    return this.supabase.rpc('update_dispatch', {
      p_dispatch_id: id, p_dispatch: dispatch, p_batches: batches, p_expected_updated_at: updatedAt
    }).returns<Dispatch[]>().single()
  }

  deleteDispatch(id: string, updatedAt: string) {
    return this.supabase.rpc('delete_dispatch', {
      p_dispatch_id: id, p_expected_updated_at: updatedAt
    })
  }

  getWorkOrders() {
    return this.supabase
      .from('work_order_summaries')
      .select('id, reference_number, description')
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .order('reference_number', { ascending: true })
  }

  getAllWorkOrders(
    page: number = 1,
    pageSize: number = 50,
    status?: string[],
    sortBy: 'reference_number' | 'description' | 'status' = 'reference_number',
    sortDirection: 'asc' | 'desc' = 'desc',
  ) {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = this.supabase
      .from('work_order_summaries')
      .select('id, reference_number, status, description', { count: 'exact' })

    if (status && status.length > 0) {
      query = query.in('status', status)
    }

    return query
      .order(sortBy, { ascending: sortDirection === 'asc' })
      .range(from, to)
  }

  async getLatestActiveWorkOrders(limit: number = 5) {
    const { data, error } = await this.supabase
      .from('work_orders')
      .select(`
        id,
        reference_number,
        status,
        created_at,
        updated_at,
        work_order_items (
          quantity_planned,
          items ( name )
        )
      `)
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { data: null, error }
    }

    if (!data) {
      return { data: [], error: null }
    }

    return {
      data: data.map(wo => ({
        id: wo.id,
        reference_number: wo.reference_number,
        status: wo.status,
        description: (wo.work_order_items || [])
          .map((woi: any) => `${woi.items?.name || 'Unknown'} (${woi.quantity_planned})`)
          .join(', ')
      })),
      error: null
    }
  }

  async getWorkOrdersDueInRange(startDate: string, endDate: string, limit: number = 5) {
    const { data, error } = await this.supabase
      .from('work_orders')
      .select(`
        id,
        reference_number,
        status,
        due_date,
        work_order_items (
          quantity_planned,
          items ( name )
        )
      `)
      .neq('status', 'cancelled')
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .order('due_date', { ascending: true })
      .limit(limit)

    if (error) {
      return { data: null, error }
    }

    if (!data) {
      return { data: [], error: null }
    }

    return {
      data: data.map(wo => ({
        id: wo.id,
        reference_number: wo.reference_number,
        status: wo.status,
        due_date: wo.due_date,
        description: (wo.work_order_items || [])
          .map((woi: any) => `${woi.items?.name || 'Unknown'} (${woi.quantity_planned})`)
          .join(', ')
      })),
      error: null
    }
  }

  getItems() {
    return this.supabase.from('items').select('id, name, sku').order('name')
  }

  getManufacturedItems() {
    return this.supabase.from('items').select('id, name, sku')
      .eq('is_manufactured', true)
      .order('name')
      .order('sku')
  }

  getAllItems() {
    return this.supabase
      .from('items_view')
      .select('*')
      .order('name', { ascending: true })
  }

  async getLowStockItems(is_manufactured: boolean, is_saleable: boolean, limit: number = 5) {
    let query = this.supabase
      .from('items_view')
      .select('id, sku, name, current_stock, reorder_level, is_saleable, is_manufactured')
      .gt('reorder_level', 0)
      .eq('is_manufactured', is_manufactured)
      .eq('is_saleable', is_saleable)

    const { data, error } = await query
      .order('reorder_level', { ascending: false })
      .order('current_stock', { ascending: true })
      .limit(200)

    if (error || !data) {
      return { data: null, error }
    }

    const lowStockItems = data
      .filter(item => Number(item.current_stock) <= Number(item.reorder_level))
      .slice(0, limit)

    return { data: lowStockItems, error: null }
  }

  getItem(id: string) {
    return this.supabase
      .from('items')
      .select(`
        *,
        bom:bom!parent_item_id (
          id,
          quantity,
          child_item:items!child_item_id (
            id,
            name,
            sku
          )
        )
      `)
      .eq('id', id)
      .single()
  }

  getItemBatches(itemId: string) {
    return this.supabase
      .from('item_batches')
      .select('id, manufacture_date, expiry_date, quantity, reserved, external_code, internal_code')
      .eq('item_id', itemId)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
  }

  getNonZeroItemBatchCounts() {
    return this.supabase
      .from('item_batches')
      .select('item_id')
      .gt('quantity', 0)
  }

  upsertItemBatches(batches: ItemBatch[]) {
    const payload = batches.map(batch => ({
      ...batch,
      updated_at: new Date(),
    }))

    return this.supabase.from('item_batches').upsert(payload, { defaultToNull: false })
  }

  deleteItemBatches(ids: string[]) {
    return this.supabase.from('item_batches').delete().in('id', ids)
  }

  getBomForItem(itemId: string) {
    return this.supabase
      .from('bom')
      .select(`
        id,
        quantity,
        child_item:items!child_item_id ( id, name, sku )
      `)
      .eq('parent_item_id', itemId)
      .order('id')
  }

  getWorkOrderItemBatchAllocations(workOrderItemId: string) {
    return this.supabase
      .from('work_order_item_batches')
      .select(`
        id,
        item_batch_id,
        quantity,
        item_batches ( id, item_id, manufacture_date, expiry_date, quantity, reserved, internal_code )
      `)
      .eq('work_order_item_id', workOrderItemId)
  }

  setWorkOrderItemBatchAllocations(
    workOrderItemId: string,
    childItemId: string,
    allocations: { item_batch_id: string, quantity: number }[]
  ) {
    return this.supabase.rpc('set_work_order_item_batch_allocations', {
      p_work_order_item_id: workOrderItemId,
      p_child_item_id: childItemId,
      p_allocations: allocations,
    })
  }

  upsertItem(item: any) {
    const payload = {
      ...item,
      updated_at: new Date(),
    }

    return this.supabase.from('items').upsert(payload).select().single()
  }

  deleteItemIfUnreferenced(itemId: string) {
    return this.supabase.rpc('delete_item_if_unreferenced', { p_item_id: itemId })
  }

  upsertBom(bomItems: any[]) {
      const payload = bomItems.map(item => ({
        ...item,
        updated_at: new Date(),
      }))

    return this.supabase.from('bom').upsert(payload, { defaultToNull: false })
  }

  deleteBomItems(ids: string[]) {
      return this.supabase.from('bom').delete().in('id', ids)
  }

  getWorkOrder(id: string) {
    return this.supabase
      .from('work_orders')
      .select(`
        *,
        work_order_items (
          id,
          item_id,
          quantity_planned,
          items ( name, sku )
        )
      `)
      .eq('id', id)
      .single()
  }

  createWorkOrder(wo: WorkOrderDetail) {
    return this.supabase.from('work_orders').insert(wo).select().single()
  }

  // Atomic: rolls back the work order if any item's material reservation fails,
  // avoiding an empty work order being saved when stock is insufficient.
  createWorkOrderWithItems(wo: WorkOrderDetail, items: Pick<WorkOrderItem, 'item_id' | 'quantity_planned'>[]) {
    return this.supabase.rpc('create_work_order_with_items', {
      p_work_order: wo,
      p_items: items
    }).single()
  }

  updateWorkOrder(id: string, wo: WorkOrderDetail) {
    const payload = {
      ...wo,
      updated_at: new Date(),
    }

    return this.supabase.from('work_orders').update(payload).eq('id', id).select().single()
  }

  upsertWorkOrderItems(items: WorkOrderItem[]) {
      const payload = items.map(item => ({
        ...item,
        updated_at: new Date(),
      }))

      return this.supabase.from('work_order_items').upsert(payload)
  }

  deleteWorkOrderItems(ids: string[]) {
      return this.supabase.from('work_order_items').delete().in('id', ids)
  }

  completeWorkOrder(workOrderId: string) {
    return this.supabase.rpc('complete_work_order', { p_work_order_id: workOrderId })
  }

  getWorkOrderYieldItems(workOrderId: string) {
    return this.supabase.from('work_order_items')
      .select('id, quantity_planned, items ( name, unit, batch_size )')
      .eq('work_order_id', workOrderId)
      .order('id')
      .returns<WorkOrderYieldItem[]>()
  }

  completeWorkOrderWithYields(log: ProductionLog, yields: WorkOrderBatchYield[]) {
    return this.supabase.rpc('complete_work_order', {
      p_work_order_id: log.work_order_id,
      p_yields: yields,
      p_log: { profile_id: log.profile_id, work_time: log.work_time, notes: log.notes }
    })
  }

  setWorkOrderInProgress(workOrderId: string) {
    return this.supabase
      .from('work_orders')
      .update({ status: 'in_progress', updated_at: new Date() })
      .eq('id', workOrderId) 
  }

  addProductionLog(log: ProductionLog) {
    return this.supabase.from('work_logs').insert(log)
  }

  getWorkOrderLogs(workOrderId: string) {
    return this.supabase
      .from('work_logs')
      .select(`
        id,
        work_time,
        notes,
        created_at,
        profile_id,
        profiles (
          username,
          email
        )
      `)
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false })
  }

  getProfiles() {
    return this.supabase
      .from('profiles')
      .select(`
        id,
        email,
        username,
        avatar_url,
        staff_level_id,
        staff_level (
          id,
          name,
          permission_name
        )
      `)
      .order('email');
  }

  getStaffLevels() {
    return this.supabase
      .from('staff_level')
      .select('*')
      .order('name');
  }

  updateProfileStaffLevel(userId: string, staffLevelId: string) {
    return this.supabase
      .from('profiles')
      .update({ staff_level_id: staffLevelId, updated_at: new Date() })
      .eq('id', userId);
  }
}
