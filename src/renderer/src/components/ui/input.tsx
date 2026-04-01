import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  error?: string | null
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, helperText, error, ...props },
  ref
) {
  return (
    <label className="field">
      {label ? <span className="field__label">{label}</span> : null}
      <input ref={ref} className={cn('input', className, error && 'input--error')} {...props} />
      {error ? <span className="field__error">{error}</span> : null}
      {!error && helperText ? <span className="field__helper">{helperText}</span> : null}
    </label>
  )
})
