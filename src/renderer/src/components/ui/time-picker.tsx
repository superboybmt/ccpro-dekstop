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
import { Clock3, X } from 'lucide-react'
import { buildTimeOptions, formatDisplayTime, parseDisplayTime } from '@renderer/lib/temporal-input'
import { cn } from '@renderer/lib/utils'
import { useFloatingPopover } from './use-floating-popover'

interface TimePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string | null
  onChange(value: string | null): void
  label?: string
  ariaLabel?: string
  disabled?: boolean
  nullable?: boolean
  minuteStep?: number
  error?: string | null
  helperText?: string
  name?: string
}

const INVALID_TIME_MESSAGE = 'Giờ không hợp lệ. Dùng định dạng HH:mm'

export const TimePicker = ({
  value,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  nullable = false,
  minuteStep = 5,
  error,
  helperText,
  className,
  name,
  ...props
}: TimePickerProps): JSX.Element => {
  const generatedId = useId()
  const inputId = name ?? generatedId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState(() => formatDisplayTime(value))
  const [open, setOpen] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)

  const options = useMemo(() => buildTimeOptions(minuteStep), [minuteStep])
  const visibleError = error ?? internalError
  const fieldLabel = ariaLabel ?? label ?? 'trường thời gian'
  const popoverStyle = useFloatingPopover({
    anchorRef: rootRef,
    popoverRef,
    open,
    preferredWidth: 320
  })

  useEffect(() => {
    setDraft(formatDisplayTime(value))
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

      setInternalError(INVALID_TIME_MESSAGE)
      return
    }

    const nextValue = parseDisplayTime(trimmed)
    if (!nextValue) {
      setInternalError(INVALID_TIME_MESSAGE)
      return
    }

    setDraft(nextValue)
    setInternalError(null)
    onChange(nextValue)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      setOpen(false)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(formatDisplayTime(value))
      setInternalError(null)
      setOpen(false)
    }
  }

  const handleSelect = (nextValue: string): void => {
    setDraft(nextValue)
    setInternalError(null)
    setOpen(false)
    onChange(nextValue)
  }

  const handleClear = (): void => {
    setDraft('')
    setInternalError(null)
    setOpen(false)
    onChange(null)
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
          placeholder="HH:mm"
          aria-label={fieldLabel}
          aria-invalid={visibleError ? 'true' : 'false'}
          className="input temporal-field__input"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value)
            setInternalError(null)
          }}
          onBlur={() => {
            commitDraft()
          }}
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
            aria-label={`Xóa giờ cho ${fieldLabel}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
            disabled={disabled}
          >
            <X size={14} />
          </button>
        ) : null}

        <button
          type="button"
          className="temporal-field__icon-button"
          aria-label={`Chọn giờ cho ${fieldLabel}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current)
            }
          }}
          disabled={disabled}
        >
          <Clock3 size={14} />
        </button>
      </div>

      {visibleError ? <span className="field__error">{visibleError}</span> : null}
      {!visibleError && helperText ? <span className="field__helper">{helperText}</span> : null}

      {open ? createPortal(
        <div
          ref={popoverRef}
          className="temporal-picker__popover"
          role="dialog"
          aria-label={`Danh sách giờ cho ${fieldLabel}`}
          style={popoverStyle}
        >
          <div className="temporal-picker__time-grid">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                className={cn('temporal-picker__time-option', option === value && 'temporal-picker__time-option--active')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
