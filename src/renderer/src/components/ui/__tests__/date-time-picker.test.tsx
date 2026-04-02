import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTimePicker } from '../date-time-picker'

describe('DateTimePicker', () => {
  it('composes date and time controls into a canonical datetime value', () => {
    render(<DateTimePicker label="Bắt đầu" value="2026-04-02 07:30:00" onChange={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Bắt đầu - ngày' })).toHaveValue('02/04/2026')
    expect(screen.getByRole('textbox', { name: 'Bắt đầu - giờ' })).toHaveValue('07:30')
  })

  it('emits a canonical datetime when the user updates the time part', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DateTimePicker label="Bắt đầu" value="2026-04-02 07:30:00" onChange={onChange} />)

    const timeInput = screen.getByRole('textbox', { name: 'Bắt đầu - giờ' })
    await user.clear(timeInput)
    await user.type(timeInput, '07:32')
    fireEvent.blur(timeInput)

    expect(onChange).toHaveBeenCalledWith('2026-04-02 07:32:00')
  })
})
