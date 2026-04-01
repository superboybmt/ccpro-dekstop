import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

export const AdminLoginPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.ccpro.admin.getSession().then((session) => {
      if (!session.authenticated) return

      navigate(session.mustChangePassword ? '/admin/account?forcePasswordChange=1' : '/admin/device-config', {
        replace: true
      })
    })
  }, [navigate])

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    try {
      const result = await window.ccpro.admin.login({ username, password })

      if (!result.ok) {
        setMessage(result.message ?? 'Đăng nhập thất bại')
        setSubmitting(false)
        return
      }

      navigate(result.requiresPasswordChange ? '/admin/account?forcePasswordChange=1' : '/admin/device-config', {
        replace: true
      })
    } catch {
      setMessage('Lỗi kết nối, vui lòng thử lại')
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-screen__bg" />

      <Card className="login-card">
        <div className="login-card__logo">
          <ShieldCheck size={22} />
        </div>

        <div className="login-card__heading">
          <h1>Admin Panel</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Quản trị cấu hình máy chấm công
          </p>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <Input
            label="Tên đăng nhập"
            placeholder="admin"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            autoComplete="username"
            required
          />

          <Input
            label="Mật khẩu"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {message ? <p className="inline-message inline-message--error">{message}</p> : null}

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập Admin'}
          </Button>
        </form>

        <div className="login-card__footer">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/login', { replace: true })}
          >
            ← Về trang đăng nhập nhân viên
          </Button>
        </div>
      </Card>
    </div>
  )
}
