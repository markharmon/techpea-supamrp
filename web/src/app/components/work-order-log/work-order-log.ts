import { Component, computed, input } from '@angular/core'
import { DatePipe, DecimalPipe } from '@angular/common'
import { WorkOrderLog } from '../../services/supabase'

@Component({
  selector: 'app-work-order-log',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './work-order-log.html',
  styleUrl: './work-order-log.scss'
})
export class WorkOrderLogComponent {
  logs = input<WorkOrderLog[]>([])

  totalLoggedTime = computed(() => this.logs().reduce((sum, log) => {
    return sum + Number(log.work_time ?? 0)
  }, 0))
}
