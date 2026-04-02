import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/providers/auth-provider'

export const LoginPage = (): JSX.Element => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [employeeCode, setEmployeeCode] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    const result = await login({
      employeeCode,
      password,
      rememberMe
    })

    setSubmitting(false)

    if (!result.ok) {
      setMessage(result.message ?? 'Đăng nhập thất bại')
      return
    }

    navigate(result.requiresPasswordChange ? '/settings?forcePasswordChange=1' : '/dashboard', {
      replace: true
    })
  }

  return (
    <div className="login-screen">
      <div className="login-screen__bg" />

      <Card className="login-card">
        <div className="login-card__logo">
          <ShieldCheck size={22} />
        </div>

        <div className="login-card__heading">
          <h1>ChấmCông PNJ</h1>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <Input
            label="Mã nhân viên"
            placeholder="E0xxxxxxx"
            value={employeeCode}
            onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())}
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

          <label className="checkbox">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Duy trì đăng nhập</span>
          </label>

          {message ? <p className="inline-message inline-message--error">{message}</p> : null}

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>

        <div className="login-card__footer">
          <span>Bạn gặp sự cố khi đăng nhập?</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.open('https://zalo.me/0989938948', '_blank')}
          >
            Liên hệ IT Support
          </Button>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigate('/admin/login')
            }}
            style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px', textDecoration: 'underline', color: 'inherit' }}
          >
            Đăng nhập Admin
          </a>
        </div>
      </Card>
    </div>
  )
}
