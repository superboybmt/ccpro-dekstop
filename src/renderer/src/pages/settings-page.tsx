import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AppInfo, DeviceSyncStatus, SettingsProfile } from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { toUiErrorMessage } from '@renderer/lib/errors'
import { formatDateTime } from '@renderer/lib/format'
import { useAuth } from '@renderer/providers/auth-provider'

const EMPTY_PROFILE: SettingsProfile = {
  fullName: '',
  employeeCode: '',
  department: null,
  hireDate: null,
  scheduleName: null
}

const EMPTY_APP_INFO: AppInfo = {
  version: '--',
  buildNumber: '--',
  connectionStatus: 'disconnected',
  lastSyncAt: null
}

const EMPTY_DEVICE_SYNC: DeviceSyncStatus = {
  status: 'idle',
  deviceIp: '10.60.1.5',
  lastSyncAt: null,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastImportedCount: 0,
  lastSkippedCount: 0,
  lastError: null
}

export const SettingsPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forcePasswordChange = searchParams.get('forcePasswordChange') === '1'
  const { markPasswordChanged } = useAuth()
  const [profile, setProfile] = useState<SettingsProfile>(EMPTY_PROFILE)
  const [appInfo, setAppInfo] = useState<AppInfo>(EMPTY_APP_INFO)
  const [deviceSync, setDeviceSync] = useState<DeviceSyncStatus>(EMPTY_DEVICE_SYNC)
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void window.ccpro.settings
      .getProfile()
      .then(setProfile)
      .catch((reason) => setMessage(toUiErrorMessage(reason, 'Không tải được hồ sơ')))

    void window.ccpro.settings
      .getAppInfo()
      .then(setAppInfo)
      .catch((reason) => setMessage(toUiErrorMessage(reason, 'Không tải được thông tin ứng dụng')))

    void window.ccpro.deviceSync
      .getStatus()
      .then(setDeviceSync)
      .catch((reason) => setMessage(toUiErrorMessage(reason, 'Không tải được trạng thái đồng bộ')))
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitting(true)
    const result = await window.ccpro.auth.changePassword(form)
    setSubmitting(false)
    setMessage(result.message)

    if (!result.ok) {
      return
    }

    markPasswordChanged()
    setForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    })

    if (forcePasswordChange) {
      navigate('/dashboard', { replace: true })
    }
  }

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'system'>('profile')

  return (
    <div className="settings-layout" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Hồ sơ
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Bảo mật
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          Hệ thống
        </button>
      </div>

      <div className="settings-content" style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
      {forcePasswordChange ? (
        <p className="inline-message inline-message--warning">
          Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng ứng dụng.
        </p>
      ) : null}

        {activeTab === 'profile' && (
          <Card title="Thông tin cá nhân">
            <div className="profile-grid">
              <Input label="Họ tên" value={profile.fullName} readOnly />
              <Input label="Mã nhân viên" value={profile.employeeCode} readOnly />
              <Input label="Phòng ban" value={profile.department ?? '--'} readOnly />
              <Input label="Ngày vào làm" value={profile.hireDate ?? '--'} readOnly />
              <Input label="Lịch làm việc" value={profile.scheduleName ?? '--'} readOnly />
            </div>
          </Card>
        )}

        {activeTab === 'security' && (
          <Card title="Bảo mật">
            <form className="settings-form" onSubmit={handleSubmit}>
              <Input
                label="Mật khẩu hiện tại"
                type="password"
                value={form.currentPassword}
                onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
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
                label="Xác nhận mật khẩu"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                required
              />

              {message ? <p className="inline-message">{message}</p> : null}

              <Button type="submit" disabled={submitting}>
                {submitting ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
              </Button>
            </form>
          </Card>
        )}

        {activeTab === 'system' && (
          <Card title="Thông tin ứng dụng">
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="field__helper">Phiên bản</span>
                <strong style={{ fontSize: '14px' }}>{appInfo.version}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="field__helper">Bản dựng</span>
                <strong style={{ fontSize: '14px' }}>{appInfo.buildNumber}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="field__helper">SQL Server</span>
                <strong style={{ fontSize: '14px' }}>{appInfo.connectionStatus}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="field__helper">Đồng bộ thiết bị</span>
                <strong style={{ fontSize: '14px' }}>{deviceSync.status}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="field__helper">Lần đồng bộ cuối</span>
                <strong style={{ fontSize: '14px' }}>{formatDateTime(deviceSync.lastSyncAt)}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="field__helper">Đã nhập / Bỏ qua</span>
                <strong style={{ fontSize: '14px' }}>
                  {deviceSync.lastImportedCount} / {deviceSync.lastSkippedCount}
                </strong>
              </div>
            </div>

            {deviceSync.lastError ? (
              <p className="inline-message inline-message--error">{deviceSync.lastError}</p>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  )
}
