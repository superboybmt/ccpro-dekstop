import { cn } from '@renderer/lib/utils'
import type { AttendanceStatus } from '@shared/api'

interface StatusPillProps {
  status: AttendanceStatus
}

const LABELS: Record<AttendanceStatus, string> = {
  'on-time': 'On-time',
  late: 'Late',
  absent: 'Absent'
}

export const StatusPill = ({ status }: StatusPillProps): JSX.Element => (
  <span className={cn('status-pill', `status-pill--${status}`)}>{LABELS[status]}</span>
)
