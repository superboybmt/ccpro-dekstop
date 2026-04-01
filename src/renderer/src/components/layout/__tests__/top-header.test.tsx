import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TopHeader } from '../top-header'

vi.mock('@renderer/providers/auth-provider', () => ({
  useAuth: () => ({
    user: {
      fullName: 'Phan Thuy',
      employeeCode: 'E0112599',
      avatarInitials: 'PT'
    }
  })
}))

describe('TopHeader', () => {
  it('triggers refresh when the refresh button is clicked', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TopHeader
          unreadCount={0}
          syncStatus={{
            status: 'ok',
            deviceIp: '10.60.1.5',
            lastSyncAt: null,
            lastRunStartedAt: null,
            lastRunFinishedAt: null,
            lastImportedCount: 0,
            lastSkippedCount: 0,
            lastError: null
          }}
          onRefresh={onRefresh}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Làm mới dữ liệu' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
