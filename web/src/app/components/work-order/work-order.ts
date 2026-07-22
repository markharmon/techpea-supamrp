// work-order.ts
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { SupabaseService, Item, WorkOrderItem } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'

@Component({
  selector: 'app-work-order',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingDirective, RouterLink, FormsModule],
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
  public activeDropdown = signal<number | null>(null)

  // 1. Maintain an array of search terms (one per row)
  public rowSearchTerms = signal<string[]>([])

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
      const { data, error } = await this.supabase.getWorkOrder(id)
      if (error) throw error

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

      let savedOrderId = this.orderId

      // 1. Create or Update Work Order
      if (this.isNew) {
        const { data, error } = await this.supabase.createWorkOrder(orderData)
        if (error) throw error
        savedOrderId = data.id
      } else {
        const { error } = await this.supabase.updateWorkOrder(this.orderId!, orderData)
        if (error) throw error
      }

      // 2. Upsert Items
      const items = (formValue.items as any[]).map(item => ({
        id: item.id, // if null, it's new
        work_order_id: savedOrderId,
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

      alert('Work Order saved!')
      this.router.navigate(['/work-orders'])

    } catch (e: any) {
        alert(e.message)
    } finally {
      this.loading.set(false)
    }
  }
}
