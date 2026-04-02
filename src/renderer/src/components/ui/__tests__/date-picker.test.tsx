import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from '../date-picker'

describe('DatePicker', () => {
  it('shows VN display format while storing canonical date values', () => {
    render(<DatePicker label="Ngày bắt đầu" value="2026-04-02" onChange={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Ngày bắt đầu' })).toHaveValue('02/04/2026')
  })

  it('parses a manually typed display date into canonical form on blur', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DatePicker label="Ngày bắt đầu" value={null} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Ngày bắt đầu' })
    await user.type(input, '15/04/2026')
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith('2026-04-15')
  })

  it('lets the user select a date from the popup calendar', () => {
    const onChange = vi.fn()

    render(<DatePicker label="Ngày bắt đầu" value="2026-04-02" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Chọn ngày cho Ngày bắt đầu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chọn ngày 15/04/2026' }))

    expect(onChange).toHaveBeenCalledWith('2026-04-15')
  })

  it('renders the calendar in a portal and reopens when the focused input is clicked again', () => {
    const { container } = render(<DatePicker ariaLabel="Ngay bat dau" value="2026-04-02" onChange={vi.fn()} />)

    const input = screen.getByRole('textbox', { name: 'Ngay bat dau' })
    fireEvent.focus(input)

    expect(screen.getByRole('dialog', { name: /Ngay bat dau/ })).toBeInTheDocument()
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Chọn ngày 15/04/2026' }))
    expect(screen.queryByRole('dialog', { name: /Ngay bat dau/ })).not.toBeInTheDocument()

    fireEvent.click(input)
    expect(screen.getByRole('dialog', { name: /Ngay bat dau/ })).toBeInTheDocument()
  })
})
