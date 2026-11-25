// work-order.ts
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { PermissionService } from '../../services/permission.service'
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { SupabaseService, Item, WorkOrderItem, WorkOrderLog } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'
import { WorkOrderLogComponent } from '../work-order-log/work-order-log'

interface BatchOption {
  id: string
  manufacture_date: string | null
  expiry_date: string | null
  internal_code: string | null
  available: number
}

interface MaterialAllocationLine {
  item_batch_id: string
  quantity: number
  expiry_date?: string | null
  internal_code?: string | null
}

interface MaterialRow {
  child_item_id: string
  child_item_name: string
  required_quantity: number
  lines: MaterialAllocationLine[]
  batches: BatchOption[]
}

@Component({
  selector: 'app-work-order',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingDirective, RouterLink, FormsModule, WorkOrderLogComponent],
  templateUrl: './work-order.html',
  styleUrl: './work-order.scss'
})
export class WorkOrderComponent implements OnInit {
  private fb = inject(FormBuilder)
  private supabase = inject(SupabaseService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  public loading = signal(false)
  public items = signal<Item[]>([])
  public workOrderLogs = signal<WorkOrderLog[]>([])
  public activeDropdown = signal<number | null>(null)

  public materialsExpanded = signal<Record<number, boolean>>({})
  public materialsLoading = signal<Record<number, boolean>>({})
  public materialRows = signal<Record<number, MaterialRow[]>>({})

  // 1. Maintain an array of search terms (one per row)
  public rowSearchTerms = signal<string[]>([])
  public permissions = inject(PermissionService)

  // 2. Derive the filtered items for every row based on the search terms
  public filteredItems = computed(() => {
    const allItems = this.items();
    const searchTerms = this.rowSearchTerms();

    return searchTerms.map(term => {
      if (!term) return allItems;
      const lowerTerm = term.toLowerCase();
      return allItems.filter(item => 
        (item.name?.toLowerCase() || '').includes(lowerTerm) ||
        (item.sku?.toLowerCase() || '').includes(lowerTerm) 
      );
    });
  });
  
  public orderId: string | null = null
  public isNew = true

  form = this.fb.group({
    reference_number: [{value: '', disabled: true}],
    status: ['planned', Validators.required],
    notes: [''],
    due_date: [''],
    items: this.fb.array([])
  })

  get itemControls() {
    return (this.form.get('items') as FormArray).controls as FormGroup[]
  }

  isMaterialsEditable(): boolean {
    const status = this.form.get('status')?.value
    return status !== 'completed' && status !== 'cancelled'
  }

  reference = signal('');

  async ngOnInit() {
    this.orderId = this.route.snapshot.paramMap.get('id')
    this.isNew = !this.orderId

    await this.loadItems()
    
    if (!this.isNew && this.orderId) {
      await this.loadOrder(this.orderId)
    } else {
        // Add one empty item row by default for new orders
      this.addItem()
    }
  }

  async loadItems() {
    const { data } = await this.supabase.getManufacturedItems()
    if (data) this.items.set(data)
  }

  async loadOrder(id: string) {
    try {
      this.loading.set(true)
      const [orderResponse, logsResponse] = await Promise.all([
        this.supabase.getWorkOrder(id),
        this.supabase.getWorkOrderLogs(id),
      ])

      if (orderResponse.error) throw orderResponse.error
      if (logsResponse.error) throw logsResponse.error

      const data = orderResponse.data
      this.workOrderLogs.set((logsResponse.data || []) as WorkOrderLog[])

      if (data) {
        this.reference.set(data.reference_number.toString().padStart(4, '0'));
        this.form.patchValue({
          reference_number: data.reference_number,
          status: data.status,
          notes: data.notes,
          due_date: data.due_date
        })

        const itemsArray = this.form.get('items') as FormArray
        itemsArray.clear()
        
        // Initialize search terms for loaded rows
        const searchTerms = new Array(data.work_order_items.length).fill('');
        this.rowSearchTerms.set(searchTerms);

        data.work_order_items.forEach((item: any) => {
          itemsArray.push(this.fb.group({
            id: [item.id], // track existing ID for updates
            item_id: [item.item_id, Validators.required],
            quantity_planned: [item.quantity_planned, [Validators.required, Validators.min(1)]]
          }))
        })
      }
    } catch (e: any) {
        alert(e.message)
    } finally {
        this.loading.set(false)
    }
  }

  addItem() {
    this.rowSearchTerms.update(terms => [...terms, ''])
    const itemsArray = this.form.get('items') as FormArray
    itemsArray.push(this.fb.group({
      id: [null],
      item_id: ['', Validators.required],
      quantity_planned: [1, [Validators.required, Validators.min(1)]]
    }))
  }

  toggleDropdown(index: number) {
    if (this.activeDropdown() === index) {
      this.activeDropdown.set(null);
    } else {
      this.activeDropdown.set(index);
      // Reset filter for this row when opening
      this.rowSearchTerms.update(terms => {
          const newTerms = [...terms];
          newTerms[index] = '';
          return newTerms;
      })
    }
  }

  selectItem(index: number, item: Item) {
      const itemsArray = this.form.get('items') as FormArray;
      const control = itemsArray.at(index);
      if (control) {
        control.get('item_id')?.setValue(item.id);
      }
      this.activeDropdown.set(null);
  }

  getSelectedDisplay(index: number): string {
      const control = this.itemControls[index].get('item_id');
      const id = control?.value;
      if (!id) return 'Select Item';
      const item = this.items().find(i => i.id === id);
      if (!item) return 'Unknown Item';
      return `${item.name} | (${item.sku || 'No SKU'})`;
  }

  filterItems(index: number, event: Event) {
    const searchTerm = (event.target as HTMLInputElement).value;
    
    this.rowSearchTerms.update(terms => {
      const newTerms = [...terms];
      newTerms[index] = searchTerm;
      return newTerms;
    });
  }

  removeItem(index: number) {
    const itemsArray = this.form.get('items') as FormArray
    const itemGroup = itemsArray.at(index) as FormGroup
    const id = itemGroup.get('id')?.value

    if (id) {
        // If it has an ID, we might need to delete it from DB or mark for deletion
        // For simplicity in this implementation, we will delete directly from DB if saving is complex, 
        // OR we can just remove from form and handle diffing on save.
        // Given Supabase "upsert", managing deletes is manual. 
        // Let's just track deleted IDs or simpler: 
        // We will just remove it from the form.
        // On save, we could fetch existing items again, compare, and delete missing?
        // OR: just mark it.
        // For this iteration: We won't handle "Delete item from existing order" gracefully in one transaction.
        // We will delete immediately if it exists in DB to keep it simple, asking for confirmation.
        if (confirm('Remove this item? This saves immediately.')) {
             this.deleteItemFromDb(id, index)
        }
    } else {
        itemsArray.removeAt(index)
        this.rowSearchTerms.update(terms => {
            const newTerms = [...terms];
            newTerms.splice(index, 1);
            return newTerms;
        })
    }
  }

  async deleteItemFromDb(id: string, index: number) {
      try {
          this.loading.set(true)
          const { error } = await this.supabase.deleteWorkOrderItems([id])
          if (error) throw error;
          (this.form.get('items') as FormArray).removeAt(index)
          this.rowSearchTerms.update(terms => {
              const newTerms = [...terms];
              newTerms.splice(index, 1);
              return newTerms;
          })
      } catch (e: any) {
          alert('Error removing item: ' + e.message)
      } finally {
          this.loading.set(false)
      }
  }

  async toggleMaterials(rowIndex: number) {
    const expanded = { ...this.materialsExpanded() }
    expanded[rowIndex] = !expanded[rowIndex]
    this.materialsExpanded.set(expanded)

    if (expanded[rowIndex]) {
      await this.loadMaterials(rowIndex)
    }
  }

  async loadMaterials(rowIndex: number) {
    const group = this.itemControls[rowIndex]
    const workOrderItemId = group.get('id')?.value
    const itemId = group.get('item_id')?.value
    const quantityPlanned = Number(group.get('quantity_planned')?.value) || 0

    if (!workOrderItemId || !itemId) return

    this.materialsLoading.update(m => ({ ...m, [rowIndex]: true }))

    try {
      const [bomRes, allocRes] = await Promise.all([
        this.supabase.getBomForItem(itemId),
        this.supabase.getWorkOrderItemBatchAllocations(workOrderItemId)
      ])

      if (bomRes.error) throw bomRes.error
      if (allocRes.error) throw allocRes.error

      const allocationsByChild = new Map<string, MaterialAllocationLine[]>()
      for (const alloc of (allocRes.data || []) as any[]) {
        const batch = alloc.item_batches
        if (!batch) continue
        const list = allocationsByChild.get(batch.item_id) || []
        list.push({
          item_batch_id: alloc.item_batch_id,
          quantity: Number(alloc.quantity),
          expiry_date: batch.expiry_date,
          internal_code: batch.internal_code
        })
        allocationsByChild.set(batch.item_id, list)
      }

      const rows: MaterialRow[] = []

      for (const bomItem of (bomRes.data || []) as any[]) {
        const childId = bomItem.child_item.id
        const { data: batches, error: batchesError } = await this.supabase.getItemBatches(childId)
        if (batchesError) throw batchesError

        const currentLines = allocationsByChild.get(childId) || []
        const ownQtyByBatch = new Map(currentLines.map(l => [l.item_batch_id, l.quantity]))

        const batchOptions: BatchOption[] = (batches || [])
          .map((b: any) => ({
            id: b.id,
            manufacture_date: b.manufacture_date,
            expiry_date: b.expiry_date,
            internal_code: b.internal_code,
            available: Number(b.quantity) - Number(b.reserved) + Number(ownQtyByBatch.get(b.id) || 0)
          }))
          .filter((b: BatchOption) => b.available > 0)

        rows.push({
          child_item_id: childId,
          child_item_name: `${bomItem.child_item.name} (${bomItem.child_item.sku || 'No SKU'})`,
          required_quantity: Number(bomItem.quantity) * quantityPlanned,
          lines: currentLines.map(l => ({ ...l })),
          batches: batchOptions
        })
      }

      this.materialRows.update(m => ({ ...m, [rowIndex]: rows }))
    } catch (e: any) {
      alert('Error loading materials: ' + e.message)
    } finally {
      this.materialsLoading.update(m => ({ ...m, [rowIndex]: false }))
    }
  }

  getAllocatedQuantity(row: MaterialRow): number {
    return row.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)
  }

  addMaterialLine(rowIndex: number, childIndex: number) {
    const rows = this.materialRows()[rowIndex]
    const row = rows[childIndex]
    const usedIds = new Set(row.lines.map(l => l.item_batch_id))
    const nextBatch = row.batches.find(b => !usedIds.has(b.id))

    if (!nextBatch) {
      alert('No more batches available for this material')
      return
    }

    row.lines = [...row.lines, { item_batch_id: nextBatch.id, quantity: 0 }]
    this.materialRows.update(m => ({ ...m, [rowIndex]: [...rows] }))
  }

  removeMaterialLine(rowIndex: number, childIndex: number, lineIndex: number) {
    const rows = this.materialRows()[rowIndex]
    const row = rows[childIndex]
    row.lines = row.lines.filter((_, i) => i !== lineIndex)
    this.materialRows.update(m => ({ ...m, [rowIndex]: [...rows] }))
  }

  async saveMaterialAllocation(rowIndex: number, childIndex: number) {
    const group = this.itemControls[rowIndex]
    const workOrderItemId = group.get('id')?.value
    const row = this.materialRows()[rowIndex][childIndex]

    const allocations = row.lines
      .filter(l => Number(l.quantity) > 0)
      .map(l => ({ item_batch_id: l.item_batch_id, quantity: Number(l.quantity) }))

    const total = allocations.reduce((sum, l) => sum + l.quantity, 0)
    if (Math.abs(total - row.required_quantity) > 0.0001) {
      alert(`Allocated quantity (${total}) must equal the required quantity (${row.required_quantity})`)
      return
    }

    try {
      this.loading.set(true)
      const { error } = await this.supabase.setWorkOrderItemBatchAllocations(
        workOrderItemId, row.child_item_id, allocations
      )
      if (error) throw error
      await this.loadMaterials(rowIndex)
    } catch (e: any) {
      alert('Error saving allocation: ' + e.message)
    } finally {
      this.loading.set(false)
    }
  }

  async save() {
    if (this.form.invalid) return

    try {
      this.loading.set(true)
      const formValue = this.form.value

      const orderData: any = {
        status: formValue.status,
        notes: formValue.notes,
        due_date: formValue.due_date
      }

      if (this.isNew) {
        // Create the work order and its items in a single atomic RPC call, so an
        // insufficient-stock error rolls back the whole thing instead of leaving
        // an empty work order saved with no items.
        const newItems = (formValue.items as any[]).map(item => ({
          item_id: item.item_id,
          quantity_planned: item.quantity_planned
        }))

        const { error } = await this.supabase.createWorkOrderWithItems(orderData, newItems)
        if (error) throw error
      } else {
        const { error } = await this.supabase.updateWorkOrder(this.orderId!, orderData)
        if (error) throw error

        const items = (formValue.items as any[]).map(item => ({
          id: item.id, // if null, it's new
          work_order_id: this.orderId,
          item_id: item.item_id,
          quantity_planned: item.quantity_planned
        } as WorkOrderItem))

        // Handle the case where created item doesn't have ID property at undefined/null
        const cleanItems = items.map(i => {
            if (!i.id) delete i.id
            return i
        })

        if (cleanItems.length > 0) {
          const { error: itemsError } = await this.supabase.upsertWorkOrderItems(cleanItems)
          if (itemsError) throw itemsError
        }
      }

      alert('Work Order saved!')
      this.router.navigate(['/work-orders'])

    } catch (e: any) {
        alert(e.message)
    } finally {
      this.loading.set(false)
    }
  }
}
