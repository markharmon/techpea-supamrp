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

export interface ProductionLog {
    work_order_id: string,
    work_time: number,
    profile_id?: string
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

  getVendors() {
    return this.supabase.from('vendors').select('*').order('name')
  }

  getWorkOrders() {
    return this.supabase
      .from('work_order_summaries')
      .select('id, reference_number, description')
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .order('reference_number', { ascending: true })
  }

  getAllWorkOrders(page: number = 1, pageSize: number = 50, status?: string[]) {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = this.supabase
      .from('work_order_summaries')
      .select('id, reference_number, status, description', { count: 'exact' })

    if (status && status.length > 0) {
      query = query.in('status', status)
    }

    return query
      .order('reference_number', { ascending: false })
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
      .neq('status', 'completed')
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

  getItems() {
    return this.supabase.from('items').select('id, name, sku').order('name')
  }

  getManufacturedItems() {
    return this.supabase.from('items').select('id, name, sku, size, colour')
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

  upsertItem(item: any) {
    const payload = {
      ...item,
      updated_at: new Date(),
    }

    return this.supabase.from('items').upsert(payload).select().single()
  }

  upsertBom(bomItems: any[]) {
      const payload = bomItems.map(item => ({
        ...item,
        updated_at: new Date(),
      }))

      return this.supabase.from('bom').upsert(payload)
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

  setWorkOrderInProgress(workOrderId: string) {
    return this.supabase
      .from('work_orders')
      .update({ status: 'in_progress', updated_at: new Date() })
      .eq('id', workOrderId) 
  }

  addProductionLog(log: ProductionLog) {
    return this.supabase.from('work_logs').insert(log)
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
