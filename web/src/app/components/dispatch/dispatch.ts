import { DatePipe } from '@angular/common'
import { Component, inject, OnInit, signal } from '@angular/core'
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import {
  Customer, DispatchAllocation, DispatchBatch, DispatchDetail, DispatchHeader,
  DispatchItem, SupabaseService
} from '../../services/supabase'
import { PermissionService } from '../../services/permission.service'
import { LoadingDirective } from '../../shared/loading/loading.directive'

type BatchLineForm = FormGroup<{
  item_batch_id: FormControl<string>
  quantity: FormControl<number | null>
}>
type ItemRowForm = FormGroup<{
  item_id: FormControl<string>
  search: FormControl<string>
  batches: FormArray<BatchLineForm>
}>
interface BatchOption extends DispatchBatch {
  available: number
}

@Component({
  selector: 'app-dispatch',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadingDirective, DatePipe],
  templateUrl: './dispatch.html',
  styleUrl: './dispatch.scss'
})
export class DispatchComponent implements OnInit {
  private fb = inject(FormBuilder)
  private supabase = inject(SupabaseService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private permissions = inject(PermissionService)
  private originalQuantities = new Map<string, number>()
  private originalBatches = new Map<string, DispatchBatch>()
  private updatedAt = ''

  canManage = this.permissions.hasAny(['admin', 'supervisor', 'staff'])
  loading = signal(false)
  ready = signal(false)
  errorMessage = signal('')
  customers = signal<Customer[]>([])
  items = signal<DispatchItem[]>([])
  batchOptions = signal<Record<string, BatchOption[]>>({})
  batchesLoading = signal<Record<string, boolean>>({})
  customerName = signal('')
  customerSearch = this.fb.nonNullable.control('')
  customerDropdownOpen = signal(false)
  customerHighlighted = signal(-1)
  openRow = signal<ItemRowForm | null>(null)
  highlighted = signal(-1)
  audit = signal<Pick<DispatchDetail, 'created_at' | 'created_by_name' | 'updated_at' | 'updated_by_name'> | null>(null)
  dispatchId: string | null = null
  isNew = true

  form = this.fb.group({
    dispatch_date: this.fb.nonNullable.control(this.today(), Validators.required),
    customer_id: this.fb.nonNullable.control('', Validators.required),
    packaging_intact: this.fb.control<boolean | null>(null, Validators.required),
    vehicle_clean_and_free_from_pests_and_contamination: this.fb.control<boolean | null>(null, Validators.required),
    product_temperature_celsius: this.fb.control<number | null>(null, Validators.required),
    items: new FormArray<ItemRowForm>([])
  })

  get itemRows() {
    return this.form.controls.items.controls
  }

  private today() {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  async ngOnInit() {
    this.dispatchId = this.route.snapshot.paramMap.get('id')
    this.isNew = !this.dispatchId
    await this.load()
  }

  async reload() {
    if (this.form.dirty && !confirm('Discard unsaved changes and reload this dispatch?')) return
    await this.load()
  }

  async load() {
    if (this.loading()) return
    this.loading.set(true)
    this.ready.set(false)
    this.errorMessage.set('')
    try {
      const [customers, items, dispatch] = await Promise.all([
        this.supabase.getAllCustomers(),
        this.supabase.getDispatchItems(),
        this.dispatchId ? this.supabase.getDispatch(this.dispatchId) : Promise.resolve(null)
      ])
      if (customers.error) throw new Error(customers.error.message)
      if (items.error) throw new Error(items.error.message)
      if (!customers.data || !items.data) throw new Error('Unable to load customers and items.')
      if (dispatch?.error) throw new Error(dispatch.error.message)
      if (this.dispatchId && !dispatch?.data) throw new Error('Dispatch not found.')
      this.customers.set(customers.data)
      this.items.set(items.data)
      this.batchOptions.set({})
      this.originalQuantities.clear()
      this.originalBatches.clear()
      this.form.controls.items.clear()
      if (dispatch?.data) {
        await this.populate(dispatch.data)
      } else {
        this.addItem()
      }
      this.closeCustomerDropdown()
      this.form.markAsPristine()
      this.ready.set(true)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load dispatch.')
    } finally {
      this.loading.set(false)
    }
  }

  private async populate(dispatch: DispatchDetail) {
    this.updatedAt = dispatch.updated_at
    this.customerName.set(dispatch.customer_name)
    this.audit.set({
      created_at: dispatch.created_at, created_by_name: dispatch.created_by_name,
      updated_at: dispatch.updated_at, updated_by_name: dispatch.updated_by_name
    })
    this.form.patchValue(dispatch)
    for (const allocation of dispatch.dispatch_item_batches) {
      const batch = allocation.item_batches
      if (!batch?.items) throw new Error('A dispatched batch or item could not be loaded.')
      this.originalQuantities.set(batch.id, Number(allocation.quantity))
      this.originalBatches.set(batch.id, batch)
      let row = this.itemRows.find(row => row.controls.item_id.value === batch.item_id)
      if (!row) {
        row = this.newItemRow(batch.item_id)
        this.form.controls.items.push(row)
      }
      row.controls.batches.push(this.newBatchLine(batch.id, Number(allocation.quantity)))
    }
    await Promise.all(this.itemRows.map(row => this.loadBatches(row.controls.item_id.value)))
  }

  private newItemRow(itemId = ''): ItemRowForm {
    const item = this.items().find(item => item.id === itemId)
    return this.fb.group({
      item_id: this.fb.nonNullable.control(itemId, Validators.required),
      search: this.fb.nonNullable.control(item ? this.displayItem(item) : ''),
      batches: new FormArray<BatchLineForm>([])
    })
  }

  private newBatchLine(batchId = '', quantity: number | null = null): BatchLineForm {
    return this.fb.group({
      item_batch_id: this.fb.nonNullable.control(batchId, Validators.required),
      quantity: this.fb.control(quantity, [Validators.required, Validators.min(Number.MIN_VALUE)])
    })
  }

  addItem() {
    this.form.controls.items.push(this.newItemRow())
    this.form.markAsDirty()
  }

  removeItem(index: number) {
    this.form.controls.items.removeAt(index)
    this.form.markAsDirty()
  }

  private selectedCustomerName() {
    return this.customers().find(customer => customer.id === this.form.controls.customer_id.value)?.name
      ?? (this.form.controls.customer_id.value ? this.customerName() : '')
  }

  filteredCustomers() {
    const raw = this.customerSearch.value.trim().toLowerCase()
    const term = raw === this.selectedCustomerName().toLowerCase() ? '' : raw
    return this.customers().filter(customer => !term || customer.name.toLowerCase().includes(term))
  }

  onCustomerSearchFocus(event: FocusEvent) {
    ;(event.target as HTMLInputElement).select()
    this.openCustomerDropdown()
  }

  openCustomerDropdown() {
    this.customerDropdownOpen.set(true)
    this.customerHighlighted.set(this.filteredCustomers().findIndex(customer =>
      customer.id === this.form.controls.customer_id.value))
  }

  onCustomerSearchInput() {
    this.customerDropdownOpen.set(true)
    this.customerHighlighted.set(this.filteredCustomers().length ? 0 : -1)
  }

  onCustomerSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!this.customerDropdownOpen()) this.openCustomerDropdown()
      const options = this.filteredCustomers()
      if (options.length === 0) return
      const current = this.customerHighlighted()
      const index = current < 0
        ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      this.customerHighlighted.set(index)
      document.getElementById(`dispatch-customer-option-${index}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && this.customerDropdownOpen()) {
      event.preventDefault()
      const customer = this.filteredCustomers()[this.customerHighlighted()]
      if (customer) this.chooseCustomer(customer)
      else this.closeCustomerDropdown()
    } else if (event.key === 'Escape' && this.customerDropdownOpen()) {
      event.preventDefault()
      event.stopPropagation()
      this.closeCustomerDropdown()
    }
  }

  closeCustomerDropdown() {
    this.customerDropdownOpen.set(false)
    this.customerHighlighted.set(-1)
    this.customerSearch.setValue(this.selectedCustomerName())
  }

  onCustomerSearchBlur() {
    this.form.controls.customer_id.markAsTouched()
    this.closeCustomerDropdown()
  }

  chooseCustomer(customer: Customer) {
    if (this.form.controls.customer_id.value !== customer.id) {
      this.form.controls.customer_id.setValue(customer.id)
      this.form.controls.customer_id.markAsDirty()
    }
    this.closeCustomerDropdown()
  }

  displayItem(item: DispatchItem) {
    return `${item.name} | ${item.sku || 'No SKU'}`
  }

  filteredItems(row: ItemRowForm) {
    const selected = this.items().find(item => item.id === row.controls.item_id.value)
    const raw = row.controls.search.value.trim().toLowerCase()
    // The selected item's full display text is not a filter, so reopening shows every item.
    const term = selected && raw === this.displayItem(selected).toLowerCase() ? '' : raw
    return this.items().filter(item => item.id === row.controls.item_id.value
      || !term || item.name.toLowerCase().includes(term) || item.sku?.toLowerCase().includes(term))
  }

  itemUsed(itemId: string, row: ItemRowForm) {
    return this.itemRows.some(other => other !== row && other.controls.item_id.value === itemId)
  }

  onSearchFocus(event: FocusEvent, row: ItemRowForm) {
    ;(event.target as HTMLInputElement).select()
    this.openDropdown(row)
  }

  onSearchInput(row: ItemRowForm) {
    this.openRow.set(row)
    this.highlighted.set(this.filteredItems(row).findIndex(item => !this.itemUsed(item.id, row)))
  }

  onSearchKeydown(event: KeyboardEvent, row: ItemRowForm) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (this.openRow() !== row) this.openDropdown(row)
      const options = this.filteredItems(row)
      if (options.length === 0) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      let index = this.highlighted()
      for (let step = 0; step < options.length; step++) {
        index = (index + delta + options.length) % options.length
        if (!this.itemUsed(options[index].id, row)) break
      }
      this.highlighted.set(index)
      document.getElementById(`dispatch-item-option-${this.itemRows.indexOf(row)}-${index}`)
        ?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      if (this.openRow() !== row) return
      event.preventDefault()
      const item = this.filteredItems(row)[this.highlighted()]
      if (item) this.chooseItem(row, item)
      else this.closeDropdown(row)
    } else if (event.key === 'Escape' && this.openRow() === row) {
      event.stopPropagation()
      this.closeDropdown(row)
    }
  }

  openDropdown(row: ItemRowForm) {
    this.openRow.set(row)
    this.highlighted.set(this.filteredItems(row).findIndex(item => item.id === row.controls.item_id.value))
  }

  closeDropdown(row: ItemRowForm) {
    if (this.openRow() === row) this.openRow.set(null)
    const selected = this.items().find(item => item.id === row.controls.item_id.value)
    if (selected) row.controls.search.setValue(this.displayItem(selected))
  }

  chooseItem(row: ItemRowForm, item: DispatchItem) {
    if (this.itemUsed(item.id, row)) return
    if (row.controls.item_id.value !== item.id) {
      row.controls.item_id.setValue(item.id)
      void this.selectItem(row)
    }
    row.controls.search.setValue(this.displayItem(item))
    this.openRow.set(null)
  }

  async selectItem(row: ItemRowForm) {
    row.controls.batches.clear()
    this.form.markAsDirty()
    const itemId = row.controls.item_id.value
    if (!itemId) return
    try {
      await this.loadBatches(itemId)
      if (row.controls.item_id.value === itemId && this.itemRows.includes(row)) this.addBatch(row)
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load batches.')
    }
  }

  private async loadBatches(itemId: string) {
    this.batchesLoading.update(current => ({ ...current, [itemId]: true }))
    try {
      const { data, error } = await this.supabase.getDispatchBatches(itemId)
      if (error) throw new Error(error.message)
      if (!data) throw new Error('No batch data was returned.')
      const batches = new Map(data.map(batch => [batch.id, batch]))
      // Fully dispatched batches no longer appear in the positive-stock query.
      for (const batch of this.originalBatches.values()) {
        if (batch.item_id === itemId && !batches.has(batch.id)) batches.set(batch.id, batch)
      }
      const options = [...batches.values()].map(batch => ({
        ...batch,
        available: Number(batch.quantity) - Number(batch.reserved) + (this.originalQuantities.get(batch.id) ?? 0)
      })).filter(batch => batch.available > 0)
      options.sort((a, b) => (a.expiry_date ?? '9999-12-31').localeCompare(b.expiry_date ?? '9999-12-31'))
      this.batchOptions.update(current => ({ ...current, [itemId]: options }))
    } finally {
      this.batchesLoading.update(current => ({ ...current, [itemId]: false }))
    }
  }

  options(row: ItemRowForm) {
    return this.batchOptions()[row.controls.item_id.value] ?? []
  }

  batchUsed(batchId: string, row: ItemRowForm, line: BatchLineForm) {
    return row.controls.batches.controls.some(other => other !== line && other.controls.item_batch_id.value === batchId)
  }

  addBatch(row: ItemRowForm) {
    const next = this.options(row).find(batch =>
      !row.controls.batches.controls.some(line => line.controls.item_batch_id.value === batch.id))
    if (!next) {
      this.errorMessage.set('No more unreserved batches are available for this item.')
      return
    }
    row.controls.batches.push(this.newBatchLine(next.id))
    this.form.markAsDirty()
  }

  removeBatch(row: ItemRowForm, index: number) {
    row.controls.batches.removeAt(index)
    this.form.markAsDirty()
  }

  available(row: ItemRowForm, line: BatchLineForm) {
    return this.options(row).find(batch => batch.id === line.controls.item_batch_id.value)?.available ?? 0
  }

  itemName(row: ItemRowForm) {
    return this.items().find(item => item.id === row.controls.item_id.value)?.name ?? 'Select Item'
  }

  itemUnit(row: ItemRowForm) {
    return this.items().find(item => item.id === row.controls.item_id.value)?.unit ?? ''
  }

  total(row: ItemRowForm) {
    return row.controls.batches.controls.reduce((sum, line) => sum + (line.controls.quantity.value ?? 0), 0)
  }

  private allocations(): DispatchAllocation[] {
    if (this.itemRows.length === 0) throw new Error('Add at least one item and batch.')
    const itemIds = new Set<string>()
    const batchIds = new Set<string>()
    const allocations: DispatchAllocation[] = []
    for (const row of this.itemRows) {
      const itemId = row.controls.item_id.value
      if (!itemId || itemIds.has(itemId)) throw new Error('Select a different item for each item row.')
      itemIds.add(itemId)
      if (this.batchesLoading()[itemId]) throw new Error('Wait for batches to finish loading.')
      if (row.controls.batches.length === 0) throw new Error(`Add a batch for ${this.itemName(row)}.`)
      for (const line of row.controls.batches.controls) {
        const batchId = line.controls.item_batch_id.value
        const quantity = line.controls.quantity.value
        if (!batchId || batchIds.has(batchId)) throw new Error('Each batch may appear only once.')
        batchIds.add(batchId)
        if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
          throw new Error('Batch quantities must be positive and finite.')
        }
        if (!this.options(row).some(batch => batch.id === batchId && batch.item_id === itemId)) {
          throw new Error('Select an available batch belonging to the selected item.')
        }
        if (quantity > this.available(row, line)) throw new Error(`Quantity exceeds available stock for ${this.itemName(row)}.`)
        allocations.push({ item_batch_id: batchId, quantity })
      }
    }
    return allocations
  }

  async save() {
    if (!this.canManage()) {
      this.errorMessage.set('You do not have permission to save dispatches.')
      return
    }
    if (this.loading() || !this.ready()) return
    this.errorMessage.set('')
    this.form.markAllAsTouched()
    try {
      if (this.form.invalid) throw new Error('Complete all dispatch details and enter a positive quantity for every batch.')
      const values = this.form.getRawValue()
      if (values.packaging_intact === null || values.vehicle_clean_and_free_from_pests_and_contamination === null
        || values.product_temperature_celsius === null || !Number.isFinite(values.product_temperature_celsius)) {
        throw new Error('Complete the safety checks and enter a finite product temperature.')
      }
      const header: DispatchHeader = {
        dispatch_date: values.dispatch_date, customer_id: values.customer_id,
        packaging_intact: values.packaging_intact,
        vehicle_clean_and_free_from_pests_and_contamination: values.vehicle_clean_and_free_from_pests_and_contamination,
        product_temperature_celsius: values.product_temperature_celsius
      }
      const batches = this.allocations()
      this.loading.set(true)
      const { data, error } = this.dispatchId
        ? await this.supabase.updateDispatch(this.dispatchId, header, batches, this.updatedAt)
        : await this.supabase.createDispatch(header, batches)
      if (error) throw new Error(error.message)
      if (!data) throw new Error('The dispatch was not saved.')
      this.dispatchId = data.id
      this.isNew = false
      this.updatedAt = data.updated_at
      this.ready.set(false)
      this.form.markAsPristine()
      alert('Dispatch saved!')
      if (!await this.router.navigate(['/dispatches'])) throw new Error('Dispatch saved. Reload before making further changes.')
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to save dispatch.')
    } finally {
      this.loading.set(false)
    }
  }

  async deleteDispatch() {
    if (!this.canManage()) {
      this.errorMessage.set('You do not have permission to delete dispatches.')
      return
    }
    if (!this.dispatchId || this.loading() || !this.ready()) return
    if (!confirm('Delete this dispatch? All saved dispatched quantities will be restored to stock. Unsaved changes will be discarded.')) return
    this.loading.set(true)
    this.errorMessage.set('')
    try {
      const { error } = await this.supabase.deleteDispatch(this.dispatchId, this.updatedAt)
      if (error) throw new Error(error.message)
      this.ready.set(false)
      if (!await this.router.navigate(['/dispatches'])) throw new Error('Dispatch deleted. Return to the dispatch list.')
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete dispatch.')
    } finally {
      this.loading.set(false)
    }
  }
}
