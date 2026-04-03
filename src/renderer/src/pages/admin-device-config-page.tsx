import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, LogOut, MonitorCog, RefreshCw, Save, Loader2, Settings, ShieldCheck, UserCog } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { TimePicker } from '@renderer/components/ui/time-picker'
import { toUiErrorMessage } from '@renderer/lib/errors'
import type {
  AdminSessionState,
  AdminShiftItem,
  AutoSwitchState,
  DeviceConfig,
  DeviceConfigResult,
  RemoteRiskPolicyMode
} from '@shared/api'
import {
  STATE_MODE_LABELS,
  SCHEDULE_META,
  missingAdminSettingsMessage,
  parseTimeToHHmm,
  parseStateName,
  getShiftTimeAriaLabel,
  getScheduleTimeAriaLabel,
  resolveAdminSettingsBridge
} from './admin-device-config-utils'

interface ScheduleEditorProps {
  times: string[]
  originalStates: AutoSwitchState[]
  onChange: (index: number, time: string) => void
  disabled: boolean
}

const ScheduleEditor = ({ times, originalStates, onChange, disabled }: ScheduleEditorProps): JSX.Element => (
  <div className="admin-schedule-table">
    <div className="admin-schedule-table__header">
      <span>Trạng thái</span>
      <span>Tên trên máy</span>
      <span>Giờ chuyển</span>
    </div>
    {SCHEDULE_META.map((meta, index) => {
      const Icon = meta.icon
      const state = originalStates[index]
      const stateName = state ? parseStateName(state.stateList, `State ${index}`) : `State ${index}`
      const currentTime = times[index] ?? meta.defaultTime

      return (
        <div key={index} className="admin-schedule-row">
          <div className="admin-schedule-row__state">
            <span className="admin-schedule-dot" style={{ background: meta.color }} />
            <Icon size={14} style={{ color: meta.color }} />
            <span>{meta.label}</span>
          </div>
          <div className="admin-schedule-row__name">
            {stateName}
          </div>
          <div className="admin-schedule-row__time">
            <TimePicker
              className="admin-schedule-time-picker"
              ariaLabel={getScheduleTimeAriaLabel(index)}
              value={currentTime}
              onChange={(value) => onChange(index, value ?? currentTime)}
              disabled={disabled}
            />
          </div>
        </div>
      )
    })}
  </div>
)

export const AdminDeviceConfigPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [session, setSession] = useState<AdminSessionState | null>(null)
  const [config, setConfig] = useState<DeviceConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [lastResult, setLastResult] = useState<DeviceConfigResult | null>(null)
  const [policyMode, setPolicyMode] = useState<RemoteRiskPolicyMode>('audit_only')
  const [policySaving, setPolicySaving] = useState(false)
  const [policyMessage, setPolicyMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [adminSettingsAvailable, setAdminSettingsAvailable] = useState(false)
  const [syncingTime, setSyncingTime] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'system' | 'security'>('general')

  // Form state
  const [selectedMode, setSelectedMode] = useState(0)
  const [editTimes, setEditTimes] = useState<string[]>(['07:30', '11:30', '13:00', '17:30'])

  // Shift management state
  const [editableShifts, setEditableShifts] = useState<AdminShiftItem[]>([])
  const originalShiftsRef = useRef<AdminShiftItem[]>([])
  const [shiftLoading, setShiftLoading] = useState(false)
  const [shiftError, setShiftError] = useState<string | null>(null)
  const [shiftSaving, setShiftSaving] = useState(false)
  const [shiftSaveMessage, setShiftSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage(null)

    try {
      const adminSettingsBridge = resolveAdminSettingsBridge()
      setAdminSettingsAvailable(Boolean(adminSettingsBridge))

      const adminSession = await window.ccpro.admin.getSession()

      if (!adminSession.authenticated) {
        navigate('/admin/login', { replace: true })
        return
      }

      if (adminSession.mustChangePassword) {
        navigate('/admin/account?forcePasswordChange=1', { replace: true })
        return
      }

      const [deviceConfig, remoteRiskPolicy] = await Promise.all([
        window.ccpro.machineConfig.getConfig(),
        adminSettingsBridge?.getRemoteRiskPolicy() ?? Promise.resolve({ mode: 'audit_only' as RemoteRiskPolicyMode })
      ])

      setSession(adminSession)
      setConfig(deviceConfig)
      setPolicyMode(remoteRiskPolicy.mode)
      setSelectedMode(deviceConfig.stateMode)

      // Parse existing schedule times into editable inputs
      const parsed = SCHEDULE_META.map((meta, i) => {
        const state = deviceConfig.schedule[i]
        if (!state) return meta.defaultTime
        const t = parseTimeToHHmm(state.stateTimezone)
        return t || meta.defaultTime
      })
      setEditTimes(parsed)
    } catch (error) {
      setMessage({
        ok: false,
        text: toUiErrorMessage(error, 'Không thể tải dữ liệu cấu hình máy chấm công.')
      })
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleTimeChange = (index: number, time: string): void => {
    setEditTimes(prev => {
      const next = [...prev]
      next[index] = time
      return next
    })
  }

  const buildSchedulePayload = (): AutoSwitchState[] => {
    return editTimes.map((time, i) => {
      const existing = config?.schedule[i]
      return {
        stateKey: existing?.stateKey ?? `state${i}`,
        stateList: existing?.stateList ?? `{"StateName":"State ${i}"}`,
        stateTimezone: time // Send HH:mm directly — the service handles conversion
      }
    })
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    setLastResult(null)

    try {
      const result = await window.ccpro.machineConfig.saveConfig({
        stateMode: selectedMode,
        schedule: buildSchedulePayload()
      })

      setLastResult(result)
      setMessage({ ok: result.ok, text: result.message })

      if (result.ok && result.after) {
        setConfig(result.after)
        setSelectedMode(result.after.stateMode)
        const parsed = SCHEDULE_META.map((meta, i) => {
          const state = result.after!.schedule[i]
          if (!state) return meta.defaultTime
          const t = parseTimeToHHmm(state.stateTimezone)
          return t || meta.defaultTime
        })
        setEditTimes(parsed)
      }
    } catch (error) {
      setMessage({
        ok: false,
        text: toUiErrorMessage(error, 'Lưu cấu hình thất bại.')
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSavePolicy = async (): Promise<void> => {
    setPolicySaving(true)
    setPolicyMessage(null)

    try {
      const adminSettingsBridge = resolveAdminSettingsBridge()
      if (!adminSettingsBridge) {
        setPolicyMessage({
          ok: false,
          text: missingAdminSettingsMessage
        })
        return
      }

      const result = await adminSettingsBridge.saveRemoteRiskPolicy({ mode: policyMode })
      setPolicyMode(result.mode)
      setPolicyMessage({ ok: result.ok, text: result.message })
    } catch (error) {
      setPolicyMessage({
        ok: false,
        text: toUiErrorMessage(error, 'Lưu chính sách bảo mật thất bại.')
      })
    } finally {
      setPolicySaving(false)
    }
  }

  const handleSyncTime = async (): Promise<void> => {
    setSyncingTime(true)
    setSyncMessage(null)

    try {
      const result = await window.ccpro.machineConfig.syncTime()
      setSyncMessage({ ok: result.ok, text: result.message })
    } catch (error) {
      setSyncMessage({
        ok: false,
        text: toUiErrorMessage(error, 'Đồng bộ giờ thất bại.')
      })
    } finally {
      setSyncingTime(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.ccpro.admin.logout()
    navigate('/admin/login', { replace: true })
  }

  // --- Shift management ---
  const loadShifts = useCallback(async () => {
    setShiftLoading(true)
    setShiftError(null)
    setShiftSaveMessage(null)

    try {
      const result = await window.ccpro.adminShifts.listShifts()
      setEditableShifts(result.shifts)
      originalShiftsRef.current = result.shifts.map((s) => ({ ...s }))
    } catch (error) {
      setShiftError(`Không thể tải ca: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setShiftLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'system') {
      void loadShifts()
    }
  }, [activeTab, loadShifts])

  const handleShiftFieldChange = (shiftId: number, field: keyof AdminShiftItem, value: string | null): void => {
    setEditableShifts((prev) =>
      prev.map((s) => (s.shiftId === shiftId ? { ...s, [field]: value } : s))
    )
  }

  const isShiftDirty = (shiftId: number): boolean => {
    const original = originalShiftsRef.current.find((s) => s.shiftId === shiftId)
    const edited = editableShifts.find((s) => s.shiftId === shiftId)
    if (!original || !edited) return false
    return (
      original.onduty !== edited.onduty ||
      original.offduty !== edited.offduty ||
      original.onLunch !== edited.onLunch ||
      original.offLunch !== edited.offLunch
    )
  }

  const dirtyShiftIds = editableShifts.filter((s) => isShiftDirty(s.shiftId)).map((s) => s.shiftId)
  const hasDirtyShifts = dirtyShiftIds.length > 0

  const handleSaveShifts = async (): Promise<void> => {
    setShiftSaving(true)
    setShiftSaveMessage(null)

    try {
      const dirtyShifts = editableShifts.filter((s) => isShiftDirty(s.shiftId))
      const results: string[] = []

      for (const shift of dirtyShifts) {
        const result = await window.ccpro.adminShifts.updateShift({
          shiftId: shift.shiftId,
          onduty: shift.onduty,
          offduty: shift.offduty,
          onLunch: shift.onLunch,
          offLunch: shift.offLunch
        })
        results.push(result.message)
      }

      // Refresh data from server after save
      const freshData = await window.ccpro.adminShifts.listShifts()
      setEditableShifts(freshData.shifts)
      originalShiftsRef.current = freshData.shifts.map((s) => ({ ...s }))

      setShiftSaveMessage({ ok: true, text: `Đã lưu ${dirtyShifts.length} ca thành công` })
    } catch (error) {
      setShiftSaveMessage({
        ok: false,
        text: `Lỗi: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setShiftSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-loading-container">
          <Loader2 className="admin-spinner" size={32} style={{ color: 'var(--primary-strong)' }} />
          <p className="inline-message">Đang kết nối máy chấm công...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>
            <MonitorCog size={20} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Cấu hình máy chấm công
          </h1>
          {session?.admin ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
              Đăng nhập: {session.admin.displayName} ({session.admin.username})
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="secondary"
            size="md"
            onClick={() => navigate('/admin/account')}
          >
            <ShieldCheck size={14} />
            Tài khoản
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => navigate('/admin/users')}
          >
            <UserCog size={14} />
            Người dùng
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => void loadData()}
            disabled={saving}
          >
            <RefreshCw size={14} />
            Làm mới
          </Button>
          <Button variant="secondary" size="md" onClick={() => void handleLogout()}>
            <LogOut size={14} />
            Đăng xuất
          </Button>
        </div>
      </div>

      <div className="admin-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <Button
          variant={activeTab === 'general' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('general')}
          size="sm"
        >
          <MonitorCog size={16} style={{ marginRight: '6px' }} />
          Máy chấm công
        </Button>
        <Button
          variant={activeTab === 'system' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('system')}
          size="sm"
        >
          <Settings size={16} style={{ marginRight: '6px' }} />
          Hệ thống
        </Button>
        <Button
          variant={activeTab === 'security' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('security')}
          size="sm"
        >
          <ShieldCheck size={16} style={{ marginRight: '6px' }} />
          Bảo mật
        </Button>
      </div>

      <div className="admin-page__grid">
        {activeTab === 'general' ? (
          <>
        {/* StateMode Card */}
        <Card title="StateMode" description="Chế độ hiển thị trên máy chấm công">
          <div className="admin-mode-selector">
            {Object.entries(STATE_MODE_LABELS).map(([modeValue, label]) => (
              <label key={modeValue} className="admin-mode-option">
                <input
                  type="radio"
                  name="stateMode"
                  value={modeValue}
                  checked={selectedMode === Number(modeValue)}
                  onChange={() => setSelectedMode(Number(modeValue))}
                  disabled={saving}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {config ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
              Giá trị hiện tại trên máy: <strong>Mode {config.stateMode}</strong>
            </p>
          ) : null}
        </Card>

        {/* Schedule Card - Editable */}
        <Card title="Lịch Auto-Switch" description="Chỉnh 4 mốc tự động đổi trạng thái trong ngày">
          <ScheduleEditor
            times={editTimes}
            originalStates={config?.schedule ?? []}
            onChange={handleTimeChange}
            disabled={saving}
          />
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            💡 Chỉnh giờ xong nhấn "Lưu cấu hình" để ghi xuống máy chấm công
          </p>
        </Card>

        {/* Action Card */}
        <Card title="Thao tác" description="Lưu cấu hình xuống máy chấm công">
          <Button
            size="lg"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            style={{ width: '100%' }}
          >
            <Save size={16} />
            {saving ? 'Đang lưu + xác minh...' : 'Lưu cấu hình'}
          </Button>

          {message ? (
            <p
              className={`inline-message ${message.ok ? 'inline-message--success' : 'inline-message--error'}`}
              style={{ marginTop: '12px' }}
            >
              {message.text}
            </p>
          ) : null}

          {lastResult ? (
            <div className="admin-save-result">
              {lastResult.before ? (
                <p>Trước: Mode {lastResult.before.stateMode}</p>
              ) : null}
              {lastResult.after ? (
                <p>Sau: Mode {lastResult.after.stateMode}</p>
              ) : null}
            </div>
          ) : null}
        </Card>
        </>
        ) : null}

        {activeTab === 'system' ? (
        <>
        {/* Compact Đồng bộ Giờ Card */}
        <Card title="Đồng bộ Giờ" description="Cập nhật giờ máy chấm công theo Server">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button
              size="md"
              variant="secondary"
              onClick={() => void handleSyncTime()}
              disabled={syncingTime || loading}
            >
              {syncingTime ? <Loader2 className="admin-spinner" size={14} /> : <Clock size={14} />}
              {syncingTime ? 'Đang đồng bộ...' : 'Đồng bộ Giờ'}
            </Button>
            {syncMessage ? (
              <span
                className={`inline-message ${syncMessage.ok ? 'inline-message--success' : 'inline-message--error'}`}
                style={{ fontSize: '12px' }}
              >
                {syncMessage.text}
              </span>
            ) : null}
          </div>
        </Card>

        {/* Ca làm việc Card */}
        <Card title="Ca làm việc" description="Chỉnh giờ vào/ra và nghỉ trưa trực tiếp trên WiseEye DB">
          <p style={{
            fontSize: '11px',
            color: 'var(--warning-strong)',
            margin: '0 0 12px',
            padding: '6px 10px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderRadius: '6px',
            borderLeft: '3px solid var(--warning-strong)'
          }}>
            ⚠️ Thay đổi ca ảnh hưởng đến tất cả nhân viên dùng ca này. Mọi thay đổi được ghi audit trail.
          </p>

          {shiftLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
              <Loader2 className="admin-spinner" size={18} style={{ color: 'var(--primary-strong)' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Đang tải danh sách ca...</span>
            </div>
          ) : shiftError ? (
            <div style={{ padding: '12px 0' }}>
              <p className="inline-message inline-message--error">{shiftError}</p>
              <Button size="sm" variant="secondary" onClick={() => void loadShifts()} style={{ marginTop: '8px' }}>
                <RefreshCw size={12} /> Thử lại
              </Button>
            </div>
          ) : editableShifts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px 0' }}>
              Không tìm thấy ca làm việc
            </p>
          ) : (
            <>
              <div className="admin-shift-table">
                <div className="admin-shift-table__header">
                  <span>Ca</span>
                  <span>Mã</span>
                  <span>Vào ca</span>
                  <span>Nghỉ trưa</span>
                  <span>Hết nghỉ trưa</span>
                  <span>Tan ca</span>
                </div>
                {editableShifts.map((shift) => {
                  const isDirty = isShiftDirty(shift.shiftId)
                  return (
                    <div
                      key={shift.shiftId}
                      className={`admin-shift-row ${isDirty ? 'admin-shift-row--dirty' : ''}`}
                    >
                      <div className="admin-shift-row__name" title={shift.shiftName}>
                        {shift.shiftName}
                      </div>
                      <div className="admin-shift-row__code">{shift.shiftCode}</div>
                      {/* Vào ca */}
                      <div className="admin-shift-row__time">
                        <TimePicker
                          className="admin-shift-time-picker"
                          ariaLabel={getShiftTimeAriaLabel(shift.shiftCode, 'onduty')}
                          value={shift.onduty}
                          onChange={(value) => handleShiftFieldChange(shift.shiftId, 'onduty', value ?? shift.onduty)}
                          disabled={shiftSaving}
                        />
                      </div>
                      {/* Nghỉ trưa */}
                      <div className="admin-shift-row__time">
                        {shift.onLunch !== null ? (
                          <TimePicker
                            className="admin-shift-time-picker"
                            ariaLabel={getShiftTimeAriaLabel(shift.shiftCode, 'onLunch')}
                            nullable
                            value={shift.onLunch}
                            onChange={(value) => handleShiftFieldChange(shift.shiftId, 'onLunch', value)}
                            disabled={shiftSaving}
                          />
                        ) : (
                          <button
                            className="admin-shift-add-btn"
                            onClick={() => handleShiftFieldChange(shift.shiftId, 'onLunch', '11:30')}
                            disabled={shiftSaving}
                          >
                            --
                          </button>
                        )}
                      </div>
                      {/* Hết nghỉ trưa */}
                      <div className="admin-shift-row__time">
                        {shift.offLunch !== null ? (
                          <TimePicker
                            className="admin-shift-time-picker"
                            ariaLabel={getShiftTimeAriaLabel(shift.shiftCode, 'offLunch')}
                            nullable
                            value={shift.offLunch}
                            onChange={(value) => handleShiftFieldChange(shift.shiftId, 'offLunch', value)}
                            disabled={shiftSaving}
                          />
                        ) : (
                          <button
                            className="admin-shift-add-btn"
                            onClick={() => handleShiftFieldChange(shift.shiftId, 'offLunch', '13:00')}
                            disabled={shiftSaving}
                          >
                            --
                          </button>
                        )}
                      </div>
                      {/* Tan ca */}
                      <div className="admin-shift-row__time">
                        <TimePicker
                          className="admin-shift-time-picker"
                          ariaLabel={getShiftTimeAriaLabel(shift.shiftCode, 'offduty')}
                          value={shift.offduty}
                          onChange={(value) => handleShiftFieldChange(shift.shiftId, 'offduty', value ?? shift.offduty)}
                          disabled={shiftSaving}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
                <Button
                  size="md"
                  onClick={() => void handleSaveShifts()}
                  disabled={shiftSaving || !hasDirtyShifts}
                >
                  {shiftSaving ? <Loader2 className="admin-spinner" size={14} /> : <Save size={14} />}
                  {shiftSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
                {hasDirtyShifts ? (
                  <span style={{ fontSize: '12px', color: 'var(--warning-strong)' }}>
                    {dirtyShiftIds.length} ca đã thay đổi
                  </span>
                ) : null}
                {shiftSaveMessage ? (
                  <span
                    className={`inline-message ${shiftSaveMessage.ok ? 'inline-message--success' : 'inline-message--error'}`}
                    style={{ fontSize: '12px' }}
                  >
                    {shiftSaveMessage.text}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </Card>
        </>
        ) : null}

        {activeTab === 'security' ? (
        <Card
          title="Bảo mật chấm công"
          description="Điều khiển việc chặn chấm công khi phát hiện điều khiển từ xa đang active"
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            <input
              aria-label="Chặn chấm công khi phát hiện điều khiển từ xa"
              type="checkbox"
              checked={policyMode === 'block_high_risk'}
              disabled={policySaving}
              onChange={(event) => {
                setPolicyMode(event.target.checked ? 'block_high_risk' : 'audit_only')
              }}
            />
            <span>Chặn chấm công khi phát hiện điều khiển từ xa</span>
          </label>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
            {policyMode === 'block_high_risk'
              ? 'Đang bật chặn khi rủi ro cao. Khi tắt, app chỉ ghi nhận và audit.'
              : 'Đang ở chế độ chỉ ghi nhận và audit, không chặn chấm công.'}
          </p>

          {!adminSettingsAvailable ? (
            <p style={{ fontSize: '12px', color: 'var(--warning-strong)', marginTop: '10px' }}>
              {missingAdminSettingsMessage}
            </p>
          ) : null}

          <Button
            size="md"
            onClick={() => void handleSavePolicy()}
            disabled={policySaving || !adminSettingsAvailable}
            style={{ marginTop: '14px' }}
          >
            <Save size={14} />
            {policySaving ? 'Đang lưu chính sách...' : 'Lưu chính sách bảo mật'}
          </Button>

          {policyMessage ? (
            <p
              className={`inline-message ${policyMessage.ok ? 'inline-message--success' : 'inline-message--error'}`}
              style={{ marginTop: '12px' }}
            >
              {policyMessage.text}
            </p>
          ) : null}
        </Card>
        ) : null}
      </div>
    </div>
  )
}
