import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimePicker } from '../time-picker'

describe('TimePicker', () => {
  it('preserves manually typed valid values outside the quick-pick step', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TimePicker label="Giờ vào" value="07:30" onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'Giờ vào' })
    await user.clear(input)
    await user.type(input, '07:32')
    fireEvent.blur(input)

    expect(onChange).toHaveBeenLastCalledWith('07:32')
  })

  it('shows quick-pick options in 5-minute steps', async () => {
    render(<TimePicker label="Giờ vào" value="07:30" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Chọn giờ cho Giờ vào' }))

    expect(screen.getByRole('button', { name: '07:35' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '07:30' })).toBeInTheDocument()
  })

  it('clears the value when nullable and the clear action is used', async () => {
    const onChange = vi.fn()

    render(<TimePicker label="Nghỉ trưa" value="12:00" onChange={onChange} nullable />)

    fireEvent.click(screen.getByRole('button', { name: 'Xóa giờ cho Nghỉ trưa' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders the time list in a portal and reopens when the focused input is clicked again', () => {
    const { container } = render(<TimePicker ariaLabel="Gio vao" value="07:30" onChange={vi.fn()} />)

    const input = screen.getByRole('textbox', { name: 'Gio vao' })
    fireEvent.focus(input)

    expect(screen.getByRole('dialog', { name: /Gio vao/ })).toBeInTheDocument()
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '07:35' }))
    expect(screen.queryByRole('dialog', { name: /Gio vao/ })).not.toBeInTheDocument()

    fireEvent.click(input)
    expect(screen.getByRole('dialog', { name: /Gio vao/ })).toBeInTheDocument()
  })
})
