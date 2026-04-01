import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type {
  AdminAccount,
  AdminSessionState,
  ChangePasswordPayload,
  MutationResult
} from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

const emptyForm: ChangePasswordPayload = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
}

export const AdminAccountPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forcePasswordChange = searchParams.get('forcePasswordChange') === '1'
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AdminSessionState | null>(null)
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [form, setForm] = useState<ChangePasswordPayload>(emptyForm)
  const [message, setMessage] = useState<MutationResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetMessage, setResetMessage] = useState<MutationResult | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const currentSession = await window.ccpro.admin.getSession()
      if (!currentSession.authenticated || !currentSession.admin) {
        navigate('/admin/login', { replace: true })
        return
      }

      setSession(currentSession)

      if (currentSession.mustChangePassword) {
        setAdmins([])
        return
      }

      const result = await window.ccpro.admin.listAdmins()
      setAdmins(result.admins)
    } catch (error) {
      setMessage({
        ok: false,
        message: `Không thể tải dữ liệu tài khoản admin: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    try {
      const result = await window.ccpro.admin.changePassword(form)
      setMessage(result)

      if (!result.ok) {
        return
      }

      setForm(emptyForm)

      if (forcePasswordChange || session?.mustChangePassword) {
        navigate('/admin/device-config', { replace: true })
        return
      }

      await loadData()
    } catch (error) {
      setMessage({
        ok: false,
        message: `Không thể đổi mật khẩu admin: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async (): Promise<void> => {
    if (!resetTarget) return

    setResetSubmitting(true)
    setResetMessage(null)

    try {
      const result = await window.ccpro.admin.resetPassword({
        adminId: resetTarget.id,
        temporaryPassword
      })
      setResetMessage(result)

      if (!result.ok) {
        return
      }

      setResetTarget(null)
      setTemporaryPassword('')
      await loadData()
    } catch (error) {
      setResetMessage({
        ok: false,
        message: `Không thể reset mật khẩu admin: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setResetSubmitting(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.ccpro.admin.logout()
    navigate('/admin/login', { replace: true })
  }

  const otherAdmins = admins.filter((item) => item.id !== session?.admin?.id)

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-loading-container">
          <p className="inline-message">Đang tải tài khoản admin...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1>Tài khoản admin</h1>
          {session?.admin ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
              Đăng nhập: {session.admin.displayName} ({session.admin.username})
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {!forcePasswordChange && !session?.mustChangePassword ? (
            <>
              <Button variant="secondary" size="md" onClick={() => navigate('/admin/device-config')}>
                Máy chấm công
              </Button>
              <Button variant="secondary" size="md" onClick={() => navigate('/admin/users')}>
                Người dùng
              </Button>
            </>
          ) : null}
          <Button variant="secondary" size="md" onClick={() => void handleLogout()}>
            Đăng xuất
          </Button>
        </div>
      </div>

      <div className="admin-page__grid">
        <Card
          title="Đổi mật khẩu"
          description="Cập nhật mật khẩu của chính bạn. Khi được cấp mật khẩu tạm, bạn cần đổi lại ngay tại đây."
        >
          {forcePasswordChange || session?.mustChangePassword ? (
            <p className="inline-message inline-message--warning">
              Bạn cần đổi lại mật khẩu admin trước khi tiếp tục.
            </p>
          ) : null}

          <form className="settings-form" onSubmit={handleChangePassword}>
            <Input
              label="Mật khẩu hiện tại"
              type="password"
              value={form.currentPassword}
              onChange={(event) =>
                setForm((current) => ({ ...current, currentPassword: event.target.value }))
              }
              required
            />
            <Input
              label="Mật khẩu mới"
              type="password"
              value={form.newPassword}
              onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
              required
            />
            <Input
              label="Xác nhận mật khẩu mới"
              type="password"
              value={form.confirmPassword}
              onChange={(event) =>
                setForm((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              required
            />

            {message ? (
              <p className={`inline-message ${message.ok ? 'inline-message--success' : 'inline-message--error'}`}>
                {message.message}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang cập nhật...' : 'Đổi mật khẩu admin'}
            </Button>
          </form>
        </Card>

        {!forcePasswordChange && !session?.mustChangePassword ? (
          <Card
            title="Cấp lại mật khẩu admin"
            description="Dùng khi admin khác quên mật khẩu. Hệ thống sẽ cấp mật khẩu tạm và buộc họ đổi lại ở lần đăng nhập tiếp theo."
          >
            <div style={{ display: 'grid', gap: '12px' }}>
              {otherAdmins.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  Chưa có admin nào khác để cấp lại mật khẩu trong ứng dụng.
                </p>
              ) : (
                otherAdmins.map((admin) => (
                  <div
                    key={admin.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div>
                      <strong>{admin.displayName}</strong>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                        {admin.username}
                        {admin.mustChangePassword ? ' • đang chờ đổi mật khẩu' : ''}
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setResetTarget(admin)}>
                      {`Reset ${admin.username}`}
                    </Button>
                  </div>
                ))
              )}
            </div>

            {resetTarget ? (
              <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                <Input
                  label="Mật khẩu tạm cho admin"
                  type="password"
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                  required
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button type="button" onClick={() => void handleResetPassword()} disabled={resetSubmitting}>
                    {resetSubmitting ? 'Đang reset...' : 'Xác nhận reset admin'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setResetTarget(null)
                      setTemporaryPassword('')
                      setResetMessage(null)
                    }}
                    disabled={resetSubmitting}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : null}

            {resetMessage ? (
              <p
                className={`inline-message ${resetMessage.ok ? 'inline-message--success' : 'inline-message--error'}`}
                style={{ marginTop: '12px' }}
              >
                {resetMessage.message}
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  )
}
