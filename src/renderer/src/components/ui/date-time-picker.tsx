import type { HTMLAttributes } from 'react'
import { joinCanonicalDateTime, splitCanonicalDateTime } from '@renderer/lib/temporal-input'
import { cn } from '@renderer/lib/utils'
import { DatePicker } from './date-picker'
import { TimePicker } from './time-picker'

interface DateTimePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string | null
  onChange(value: string | null): void
  label?: string
  disabled?: boolean
  nullable?: boolean
  error?: string | null
  helperText?: string
}

export const DateTimePicker = ({
  value,
  onChange,
  label = 'Thời gian',
  disabled = false,
  nullable = false,
  error,
  helperText,
  className,
  ...props
}: DateTimePickerProps): JSX.Element => {
  const parts = splitCanonicalDateTime(value)

  return (
    <div className={cn('field date-time-picker', className)} {...props}>
      <span className="field__label">{label}</span>

      <div className="date-time-picker__grid">
        <DatePicker
          label={`${label} - ngày`}
          value={parts.date}
          onChange={(nextDate) => onChange(joinCanonicalDateTime(nextDate, parts.time))}
          disabled={disabled}
          nullable={nullable}
        />
        <TimePicker
          label={`${label} - giờ`}
          value={parts.time}
          onChange={(nextTime) => onChange(joinCanonicalDateTime(parts.date, nextTime))}
          disabled={disabled}
          nullable={nullable}
        />
      </div>

      {error ? <span className="field__error">{error}</span> : null}
      {!error && helperText ? <span className="field__helper">{helperText}</span> : null}
    </div>
  )
}
