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
  buildMonthOptions,
  formatDisplayMonth,
  getMonthYear,
  parseDisplayMonth
} from '@renderer/lib/temporal-input'
import { cn } from '@renderer/lib/utils'
import { useFloatingPopover } from './use-floating-popover'

interface MonthPickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
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

const INVALID_MONTH_MESSAGE = 'Tháng không hợp lệ. Dùng định dạng MM/yyyy'

export const MonthPicker = ({
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
}: MonthPickerProps): JSX.Element => {
  const generatedId = useId()
  const inputId = name ?? generatedId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState(() => formatDisplayMonth(value))
  const [open, setOpen] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)
  const [visibleYear, setVisibleYear] = useState(() => getMonthYear(value))

  const visibleError = error ?? internalError
  const fieldLabel = ariaLabel ?? label ?? 'trường tháng'
  const options = useMemo(() => buildMonthOptions(visibleYear), [visibleYear])
  const popoverStyle = useFloatingPopover({
    anchorRef: rootRef,
    popoverRef,
    open,
    preferredWidth: 280
  })

  useEffect(() => {
    setDraft(formatDisplayMonth(value))
    setVisibleYear(getMonthYear(value))
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

  const commitDraft = (): void => {
    const trimmed = draft.trim()

    if (!trimmed) {
      if (nullable) {
        setDraft('')
        setInternalError(null)
        onChange(null)
        return
      }

      setInternalError(INVALID_MONTH_MESSAGE)
      return
    }

    const canonical = parseDisplayMonth(trimmed)
    if (!canonical) {
      setInternalError(INVALID_MONTH_MESSAGE)
      return
    }

    setDraft(formatDisplayMonth(canonical))
    setVisibleYear(getMonthYear(canonical))
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
      setDraft(formatDisplayMonth(value))
      setInternalError(null)
      setOpen(false)
    }
  }

  const handleSelect = (canonical: string): void => {
    setDraft(formatDisplayMonth(canonical))
    setVisibleYear(getMonthYear(canonical))
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
          placeholder="MM/yyyy"
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
            aria-label={`Xóa tháng cho ${fieldLabel}`}
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
          aria-label={`Chọn tháng cho ${fieldLabel}`}
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
          className="temporal-picker__popover temporal-picker__popover--month"
          role="dialog"
          aria-label={`Danh sách tháng cho ${fieldLabel}`}
          style={popoverStyle}
        >
          <div className="temporal-picker__calendar-header">
            <button
              type="button"
              className="temporal-field__icon-button"
              aria-label="Năm trước"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setVisibleYear((current) => current - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <strong className="temporal-picker__calendar-title">{visibleYear}</strong>
            <button
              type="button"
              className="temporal-field__icon-button"
              aria-label="Năm sau"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setVisibleYear((current) => current + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="temporal-picker__month-grid">
            {options.map((option) => (
              <button
                key={option.canonical}
                type="button"
                className={cn(
                  'temporal-picker__month-option',
                  option.canonical === value && 'temporal-picker__month-option--active'
                )}
                aria-label={`Chọn tháng ${option.label}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option.canonical)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
