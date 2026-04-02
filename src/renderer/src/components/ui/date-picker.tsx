import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  buildCalendarDays,
  formatDisplayDate,
  getCalendarMonth,
  parseDisplayDate
} from '@renderer/lib/temporal-input'
import { cn } from '@renderer/lib/utils'
import { useFloatingPopover } from './use-floating-popover'

interface DatePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string | null
  onChange(value: string | null): void
  label?: string
  ariaLabel?: string
  disabled?: boolean
  nullable?: boolean
  error?: string | null
  helperText?: string
  name?: string
}

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const INVALID_DATE_MESSAGE = 'Ngày không hợp lệ. Dùng định dạng dd/MM/yyyy'
const MONTH_LABELS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12'
]

const shiftMonth = (year: number, month: number, delta: number): { year: number; month: number } => {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1
  }
}

const buildCalendarCells = (year: number, month: number): Array<
  { type: 'empty'; key: string } | { type: 'day'; key: string; day: number; canonical: string }
> => {
  const days = buildCalendarDays(year, month)
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const mondayFirstOffset = (firstDay + 6) % 7
  const cells: Array<{ type: 'empty'; key: string } | { type: 'day'; key: string; day: number; canonical: string }> = []

  for (let index = 0; index < mondayFirstOffset; index += 1) {
    cells.push({ type: 'empty', key: `empty-${year}-${month}-${index}` })
  }

  for (const day of days) {
    cells.push({ type: 'day', ...day })
  }

  return cells
}

export const DatePicker = ({
  value,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  nullable = false,
  error,
  helperText,
  className,
  name,
  ...props
}: DatePickerProps): JSX.Element => {
  const generatedId = useId()
  const inputId = name ?? generatedId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState(() => formatDisplayDate(value))
  const [open, setOpen] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(() => getCalendarMonth(value))
  const visibleError = error ?? internalError
  const fieldLabel = ariaLabel ?? label ?? 'trường ngày'
  const popoverStyle = useFloatingPopover({
    anchorRef: rootRef,
    popoverRef,
    open,
    preferredWidth: 320
  })

  useEffect(() => {
    setDraft(formatDisplayDate(value))
    setVisibleMonth(getCalendarMonth(value))
    setInternalError(null)
  }, [value])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const calendarCells = useMemo(
    () => buildCalendarCells(visibleMonth.year, visibleMonth.month),
    [visibleMonth.month, visibleMonth.year]
  )

  const commitDraft = (): void => {
    const trimmed = draft.trim()

    if (!trimmed) {
      if (nullable) {
        onChange(null)
        setDraft('')
        setInternalError(null)
        return
      }

      setInternalError(INVALID_DATE_MESSAGE)
      return
    }

    const canonical = parseDisplayDate(trimmed)
    if (!canonical) {
      setInternalError(INVALID_DATE_MESSAGE)
      return
    }

    setDraft(formatDisplayDate(canonical))
    setVisibleMonth(getCalendarMonth(canonical))
    setInternalError(null)
    onChange(canonical)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      setOpen(false)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(formatDisplayDate(value))
      setInternalError(null)
      setOpen(false)
    }
  }

  const handleSelect = (canonical: string): void => {
    setDraft(formatDisplayDate(canonical))
    setInternalError(null)
    setOpen(false)
    onChange(canonical)
  }

  return (
    <div ref={rootRef} className={cn('field temporal-field', className)} {...props}>
      {label ? (
        <label htmlFor={inputId} className="field__label">
          {label}
        </label>
      ) : null}

      <div className={cn('temporal-field__control', visibleError && 'temporal-field__control--error')}>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          placeholder="dd/MM/yyyy"
          aria-label={fieldLabel}
          aria-invalid={visibleError ? 'true' : 'false'}
          className="input temporal-field__input"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value)
            setInternalError(null)
          }}
          onBlur={() => commitDraft()}
          onFocus={() => {
            if (!disabled) {
              setOpen(true)
            }
          }}
          onClick={() => {
            if (!disabled) {
              setOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
        />

        {nullable && draft ? (
          <button
            type="button"
            className="temporal-field__icon-button"
            aria-label={`Xóa ngày cho ${fieldLabel}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDraft('')
              setInternalError(null)
              setOpen(false)
              onChange(null)
            }}
            disabled={disabled}
          >
            <X size={14} />
          </button>
        ) : null}

        <button
          type="button"
          className="temporal-field__icon-button"
          aria-label={`Chọn ngày cho ${fieldLabel}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current)
            }
          }}
          disabled={disabled}
        >
          <CalendarDays size={14} />
        </button>
      </div>

      {visibleError ? <span className="field__error">{visibleError}</span> : null}
      {!visibleError && helperText ? <span className="field__helper">{helperText}</span> : null}

      {open ? createPortal(
        <div
          ref={popoverRef}
          className="temporal-picker__popover temporal-picker__popover--calendar"
          role="dialog"
          aria-label={`Lịch cho ${fieldLabel}`}
          style={popoverStyle}
        >
          <div className="temporal-picker__calendar-header">
            <button
              type="button"
              className="temporal-field__icon-button"
              aria-label="Tháng trước"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setVisibleMonth((current) => shiftMonth(current.year, current.month, -1))}
            >
              <ChevronLeft size={14} />
            </button>
            <strong className="temporal-picker__calendar-title">
              {MONTH_LABELS[visibleMonth.month - 1]} {visibleMonth.year}
            </strong>
            <button
              type="button"
              className="temporal-field__icon-button"
              aria-label="Tháng sau"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setVisibleMonth((current) => shiftMonth(current.year, current.month, 1))}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="temporal-picker__calendar-grid">
            {WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday} className="temporal-picker__calendar-weekday">
                {weekday}
              </span>
            ))}

            {calendarCells.map((cell) =>
              cell.type === 'empty' ? (
                <span key={cell.key} className="temporal-picker__calendar-empty" />
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  className={cn(
                    'temporal-picker__calendar-day',
                    cell.canonical === value && 'temporal-picker__calendar-day--active'
                  )}
                  aria-label={`Chọn ngày ${formatDisplayDate(cell.canonical)}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(cell.canonical)}
                >
                  {cell.day}
                </button>
              )
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
