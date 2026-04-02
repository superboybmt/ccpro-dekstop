import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthPicker } from '../month-picker'

describe('MonthPicker', () => {
  it('shows VN display format while storing canonical month values', () => {
    render(<MonthPicker label="Tháng chấm công" value="2026-04" onChange={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Tháng chấm công' })).toHaveValue('04/2026')
  })

  it('parses a manually typed display month into canonical form on blur', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<MonthPicker label="Tháng chấm công" value={null} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'Tháng chấm công' })
    await user.type(input, '05/2026')
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith('2026-05')
  })

  it('lets the user select a month from the popup list', () => {
    const onChange = vi.fn()

    render(<MonthPicker label="Tháng chấm công" value="2026-04" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Chọn tháng cho Tháng chấm công' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chọn tháng 09/2026' }))

    expect(onChange).toHaveBeenCalledWith('2026-09')
  })

  it('renders the month list in a portal and reopens when the focused input is clicked again', () => {
    const { container } = render(<MonthPicker ariaLabel="Thang cham cong" value="2026-04" onChange={vi.fn()} />)

    const input = screen.getByRole('textbox', { name: 'Thang cham cong' })
    fireEvent.focus(input)

    expect(screen.getByRole('dialog', { name: /Thang cham cong/ })).toBeInTheDocument()
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Chọn tháng 09/2026' }))
    expect(screen.queryByRole('dialog', { name: /Thang cham cong/ })).not.toBeInTheDocument()

    fireEvent.click(input)
    expect(screen.getByRole('dialog', { name: /Thang cham cong/ })).toBeInTheDocument()
  })
})
