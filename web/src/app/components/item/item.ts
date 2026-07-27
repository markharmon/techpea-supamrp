import { Component, inject, OnInit, signal } from '@angular/core'
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { SupabaseService } from '../../services/supabase'
import { LoadingDirective } from '../../shared/loading/loading.directive'

@Component({
  selector: 'app-item',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingDirective, RouterLink], // JsonPipe for debug if needed
  templateUrl: './item.html',
  styleUrl: './item.scss'
})
export class ItemComponent implements OnInit {
  private fb = inject(FormBuilder)
  private supabase = inject(SupabaseService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  loading = signal(false)
  allItems = signal<any[]>([]) // For the dropdown
  vendors = signal<any[]>([])
  categories = signal<any[]>([])
  
  itemId: string | null = null
  isNew = true

  form = this.fb.group({
    name: ['', Validators.required],
    sku: [''],
    barcode: [''],
    description: [''],
    category_id: [null as string | null],
    vendor_id: [null as string | null],
    
    // Vendor details
    vendor_sku: [''],
    vendor_description: [''],
    
    unit: ['pcs', Validators.required],
    
    // Inventory & Financials
    current_stock: [0],
    cost_per_unit: [0],
    sales_price: [0],
    reorder_level: [0],
    reorder_quantity: [0],
    pack_size: [1],
    weight: [0],

    is_manufactured: [false],
    is_saleable: [false],
    bom: this.fb.array([])
  })

  get bomControls() {
    return (this.form.get('bom') as FormArray).controls as FormGroup[]
  }

  isManufacturedControl = this.form.get('is_manufactured')

  async ngOnInit() {
    this.itemId = this.route.snapshot.paramMap.get('id')
    this.isNew = !this.itemId

    await this.loadAllItems()
    
    if (!this.isNew && this.itemId) {
      await this.loadItem(this.itemId)
    }
  }

  async loadAllItems() {
    const { data } = await this.supabase.getItems()
    if (data) this.allItems.set(data)
    
    const { data: vendors } = await this.supabase.getVendors()
    if (vendors) this.vendors.set(vendors)

    const { data: cats } = await this.supabase.getItemCategories()
    if (cats) this.categories.set(cats)
  }

  async loadItem(id: string) {
    try {
      this.loading.set(true)
      const { data, error } = await this.supabase.getItem(id)
      if (error) throw error

      if (data) {
        this.form.patchValue({
          name: data.name,
          sku: data.sku,
          barcode: data.barcode,
          description: data.description,
          category_id: data.category_id,
          vendor_id: data.vendor_id,
          vendor_sku: data.vendor_sku,
          vendor_description: data.vendor_description,
          unit: data.unit,
          current_stock: data.current_stock,
          cost_per_unit: data.cost_per_unit,
          sales_price: data.sales_price,
          reorder_level: data.reorder_level,
          reorder_quantity: data.reorder_quantity,
          pack_size: data.pack_size,
          weight: data.weight,
          is_manufactured: data.is_manufactured,
          is_saleable: data.is_saleable,
        })

        const bomArray = this.form.get('bom') as FormArray
        bomArray.clear()

        if (data.bom && Array.isArray(data.bom)) {
            data.bom.forEach((bomItem: any) => {
                bomArray.push(this.fb.group({
                    id: [bomItem.id],
                    child_item_id: [bomItem.child_item_id, Validators.required], // Note: The initial implementation of SupabaseService.getItem nested child items differently. Let's verify structure.
                    // The query was: bom:bom!parent_item_id ( id, quantity, child_item:items!child_item_id ( id, name, sku ) )
                    // So bomItem has { id, quantity, child_item: { id, name, sku } }
                    // However, we need child_item_id for the form control. 
                    // PostgREST embedding usually keeps the FK if asked, or we can get it from the nested object.
                    // Actually, if we use the FK relationship, `child_item_id` might not be returned directly unless selected.
                    // But in the query `child_item:items!child_item_id`, the FK column `child_item_id` in `bom` table is the link.
                    // We should check if `child_item_id` is returned in the root of the bom object.
                    // The select string was `id, quantity, child_item:items!child_item_id(...)`. 
                    // It does NOT explicitly select `child_item_id`. 
                    // But `child_item` object has `id`. That is the child_item_id.
                    quantity: [bomItem.quantity, [Validators.required, Validators.min(0.0001)]]
                }))
                
                // Patch the BOM item ID correctly
                const lastControl = bomArray.at(bomArray.length - 1)
                lastControl.get('child_item_id')?.setValue(bomItem.child_item.id)
            })
        }
      }
    } catch (e: any) {
        alert(e.message)
    } finally {
        this.loading.set(false)
    }
  }

  addBomItem() {
    const bomArray = this.form.get('bom') as FormArray
    bomArray.push(this.fb.group({
      id: [null],
      child_item_id: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.0001)]]
    }))
  }

  removeBomItem(index: number) {
    const bomArray = this.form.get('bom') as FormArray
    const itemGroup = bomArray.at(index) as FormGroup
    const id = itemGroup.get('id')?.value

    if (id) {
        if (confirm('Remove this material? This saves immediately.')) {
             this.deleteBomItemFromDb(id, index)
        }
    } else {
        bomArray.removeAt(index)
    }
  }

  async deleteBomItemFromDb(id: string, index: number) {
      try {
          this.loading.set(true)
          const { error } = await this.supabase.deleteBomItems([id])
          if (error) throw error;
          (this.form.get('bom') as FormArray).removeAt(index)
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

      const itemData: any = {
        name: formValue.name,
        sku: formValue.sku,
        barcode: formValue.barcode,
        description: formValue.description,
        category_id: formValue.category_id,
        vendor_id: formValue.vendor_id,
        unit: formValue.unit,
        current_stock: formValue.current_stock,
        cost_per_unit: formValue.cost_per_unit,
        sales_price: formValue.sales_price,
        
        // New fields
        vendor_sku: formValue.vendor_sku,
        vendor_description: formValue.vendor_description,
        reorder_level: formValue.reorder_level,
        reorder_quantity: formValue.reorder_quantity,
        pack_size: formValue.pack_size,
        weight: formValue.weight,
      
        is_manufactured: formValue.is_manufactured,
        is_saleable: formValue.is_saleable
      }

      let savedItemId = this.itemId

      // 1. Upsert Item
      if (this.isNew) {
        const { data, error } = await this.supabase.upsertItem(itemData)
        if (error) throw error
        savedItemId = data.id 
      } else {
           // For updates we need the ID
           itemData.id = this.itemId
           const { error } = await this.supabase.upsertItem(itemData)
           if (error) throw error
      }

      // 2. Upsert BOM
      // Only processing BOM if it is manufactured? 
      // Probably safest to always process if they added rows, but technically logic says only manufactured items have BOMs.
      // Let's process if array has items.
      
      if (formValue.bom && formValue.bom.length > 0) {
          const bomItems = (formValue.bom as any[]).map(b => ({
            id: b.id, // null if new
            parent_item_id: savedItemId,
            child_item_id: b.child_item_id,
            quantity: b.quantity
          }))

          const cleanBom = bomItems.map(b => {
             if (!b.id) delete b.id
             return b
           })
           
           const { error: bomError } = await this.supabase.upsertBom(cleanBom)
           if (bomError) throw bomError
      }

      alert('Item saved!')
      this.router.navigate(['/items'])

    } catch (e: any) {
        alert(e.message)
    } finally {
      this.loading.set(false)
    }
  }

  async deleteItem() {
    if (this.isNew || !this.itemId) return

    if (!confirm('Delete this item? This cannot be undone.')) return

    try {
      this.loading.set(true)
      const { error } = await this.supabase.deleteItemIfUnreferenced(this.itemId)
      if (error) throw error

      alert('Item deleted.')
      this.router.navigate(['/items'])
    } catch (e: any) {
      const detail = e?.details ? `\n${e.details}` : ''
      alert(`Cannot delete item.${detail}`)
    } finally {
      this.loading.set(false)
    }
  }
}
