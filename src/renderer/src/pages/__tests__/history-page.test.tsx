import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { formatAppMonthKey } from '@shared/app-time'
import { HistoryPage } from '../history-page'

const currentMonth = formatAppMonthKey(new Date())

const createHistoryResult = (overrides?: Partial<Parameters<typeof window.ccpro.attendance.getHistory>[0]>) => ({
  filter: {
    month: overrides?.month ?? currentMonth,
    startDate: overrides?.startDate ?? '',
    endDate: overrides?.endDate ?? '',
    page: overrides?.page ?? 1,
    pageSize: overrides?.pageSize ?? 15
  },
  stats: {
    totalWorkingDays: 0,
    onTimeRate: 0,
    lateDays: 0,
    avgWorkingHoursPerDay: 0
  },
  records: [],
  total: 0
})

const SearchProbe = (): JSX.Element => {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

const formatDisplayMonth = (canonicalMonth: string): string =>
  `${canonicalMonth.slice(5, 7)}/${canonicalMonth.slice(0, 4)}`

describe('HistoryPage', () => {
  it('uses the shared month filter while keeping canonical month params', async () => {
    const getHistory = vi.fn(async (filter) => createHistoryResult(filter))

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getHistory,
        getDashboard: undefined as never,
        checkIn: undefined as never,
        checkOut: undefined as never
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/history']}>
        <HistoryPage />
        <SearchProbe />
      </MemoryRouter>
    )

    const monthInput = await screen.findByRole('textbox', { name: 'Tháng chấm công' })
    expect(monthInput).toHaveValue(formatDisplayMonth(currentMonth))

    await waitFor(() => {
      expect(getHistory).toHaveBeenLastCalledWith({
        month: currentMonth,
        startDate: undefined,
        endDate: undefined,
        page: 1,
        pageSize: 15
      })
    })

    expect(screen.getByTestId('location-search')).toHaveTextContent(`month=${currentMonth}`)
  })

  it('uses shared date pickers for custom ranges while keeping canonical start/end params', async () => {
    const getHistory = vi.fn(async (filter) => createHistoryResult(filter))
    const user = userEvent.setup()

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getHistory,
        getDashboard: undefined as never,
        checkIn: undefined as never,
        checkOut: undefined as never
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/history']}>
        <HistoryPage />
        <SearchProbe />
      </MemoryRouter>
    )

    const startInput = await screen.findByRole('textbox', { name: 'Từ ngày' })
    const endInput = screen.getByRole('textbox', { name: 'Đến ngày' })

    await user.clear(startInput)
    await user.type(startInput, '01/04/2026')
    fireEvent.blur(startInput)

    await user.clear(endInput)
    await user.type(endInput, '15/04/2026')
    fireEvent.blur(endInput)

    await waitFor(() => {
      expect(getHistory).toHaveBeenLastCalledWith({
        month: undefined,
        startDate: '2026-04-01',
        endDate: '2026-04-15',
        page: 1,
        pageSize: 15
      })
    })

    expect(screen.getByTestId('location-search')).toHaveTextContent('start=2026-04-01')
    expect(screen.getByTestId('location-search')).toHaveTextContent('end=2026-04-15')
  })

  it('keeps empty date-range fields neutral until the user enters a date', async () => {
    const getHistory = vi.fn(async (filter) => createHistoryResult(filter))
    const user = userEvent.setup()

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getHistory,
        getDashboard: undefined as never,
        checkIn: undefined as never,
        checkOut: undefined as never
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/history']}>
        <HistoryPage />
        <SearchProbe />
      </MemoryRouter>
    )

    const endInput = await screen.findByRole('textbox', { name: /Đến ngày/i })
    await user.click(endInput)
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/Ngày không hợp lệ/i)).not.toBeInTheDocument()
      expect(screen.getByTestId('location-search')).toHaveTextContent(`month=${currentMonth}`)
    })
  })
})
