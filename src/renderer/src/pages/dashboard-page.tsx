import { useEffect, useState } from 'react'
import { CalendarDays, Fingerprint, TimerReset } from 'lucide-react'
import type { DashboardData, HistoryData, MutationResult } from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { toUiErrorMessage } from '@renderer/lib/errors'
import { formatDateTime, formatPercent } from '@renderer/lib/format'
import { formatAppMonthKey, formatAppTimeKey } from '@shared/app-time'

const DEFAULT_DASHBOARD: DashboardData = {
  shift: null,
  timeline: [],
  nextAction: 'check-in',
  lastEventAt: null,
  connectionStatus: 'connected'
}

const EMPTY_HISTORY: HistoryData = {
  filter: { month: null, startDate: '', endDate: '', page: 1, pageSize: 5 },
  stats: { totalWorkingDays: 0, onTimeRate: 0, totalOvertimeHours: 0, absences: 0 },
  records: [],
  total: 0
}

const DASHBOARD_REFRESH_INTERVAL_MS = 5_000
const SQL_CONNECTION_ERROR_TEXT = 'SQL Server'
const SQL_UNAVAILABLE_PUNCH_MESSAGE =
  'Không thể chấm công khi ứng dụng chưa kết nối được SQL Server nội bộ. Vui lòng kết nối lại mạng LAN và thử lại.'

const markDashboardDisconnected = (current: DashboardData): DashboardData => ({
  ...current,
  connectionStatus: 'disconnected'
})

export const DashboardPage = (): JSX.Element => {
  const [clock, setClock] = useState(() => new Date())
  const [dashboard, setDashboard] = useState<DashboardData>(DEFAULT_DASHBOARD)
  const [history, setHistory] = useState<HistoryData>(EMPTY_HISTORY)
  const [message, setMessage] = useState<MutationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadDashboard = async (options?: { silent?: boolean }): Promise<void> => {
    try {
      if (!options?.silent) {
        setLoading(true)
      }

      const dashRes = await window.ccpro.attendance.getDashboard()
      setDashboard(dashRes)
      setMessage(null)
    } catch (error) {
      const uiMessage = toUiErrorMessage(error, 'Không tải được dữ liệu tổng hợp')
      if (uiMessage.includes(SQL_CONNECTION_ERROR_TEXT)) {
        setDashboard(markDashboardDisconnected)
      }

      setMessage({
        ok: false,
        message: uiMessage
      })
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }

  const loadHistory = async (): Promise<void> => {
    try {
      const currentMonth = formatAppMonthKey(new Date())
      const histRes = await window.ccpro.attendance.getHistory({ month: currentMonth, page: 1, pageSize: 5 })
      setHistory(histRes ?? EMPTY_HISTORY)
    } catch {
      setHistory(EMPTY_HISTORY)
    }
  }

  useEffect(() => {
    void loadDashboard()
    void loadHistory()

    const clockTimer = window.setInterval(() => setClock(new Date()), 1_000)
    const refreshTimer = window.setInterval(() => {
      void loadDashboard({ silent: true })
    }, DASHBOARD_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(clockTimer)
      window.clearInterval(refreshTimer)
    }
  }, [])

  const handlePunch = async (action: 'check-in' | 'check-out'): Promise<void> => {
    setSubmitting(true)

    try {
      const result =
        action === 'check-in' ? await window.ccpro.attendance.checkIn() : await window.ccpro.attendance.checkOut()
      setMessage(result)
      await Promise.all([loadDashboard(), loadHistory()])
    } catch (error) {
      const uiMessage = toUiErrorMessage(error, 'Không thể chấm công lúc này')
      if (uiMessage.includes(SQL_CONNECTION_ERROR_TEXT)) {
        setDashboard(markDashboardDisconnected)
      }

      setMessage({
        ok: false,
        message: uiMessage
      })
    } finally {
      setSubmitting(false)
    }
  }

  const punchBlockedByConnection = dashboard.connectionStatus === 'disconnected'
  const remoteRisk = dashboard.remoteRisk
  const punchBlockedByRemoteRisk = remoteRisk?.blocking === true
  const remoteRiskMessage =
    remoteRisk && punchBlockedByRemoteRisk
      ? remoteRisk.message ?? 'Không thể chấm công khi đang phát hiện điều khiển từ xa hoạt động.'
      : null

  return (
    <div className="page-grid" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
          <Card className="hero-card" title="Hệ thống thời gian thực">
            <div className="hero-card__clock">
              <div>
                <strong>{formatAppTimeKey(clock)}</strong>
                <span>
                  <CalendarDays size={14} />
                  {clock.toLocaleDateString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="hero-card__icon">
                <TimerReset size={22} />
              </div>
            </div>

            <div className="dashboard-actions" style={{ marginTop: '12px', marginBottom: 0 }}>
              <Button
                size="lg"
                className="dashboard-actions__hero"
                disabled={loading || submitting || punchBlockedByConnection || punchBlockedByRemoteRisk}
                onClick={() => void handlePunch(dashboard.nextAction)}
              >
                <Fingerprint size={18} />
                {dashboard.nextAction === 'check-in' ? 'Chấm công vào' : 'Chấm công ra'}
              </Button>
            </div>

            {punchBlockedByConnection ? (
              <p className="inline-message inline-message--error" style={{ marginTop: '8px' }}>
                {SQL_UNAVAILABLE_PUNCH_MESSAGE}
              </p>
            ) : null}

            {remoteRiskMessage ? (
              <p className="inline-message inline-message--error" style={{ marginTop: '8px' }}>
                {remoteRiskMessage}
              </p>
            ) : null}

            {dashboard.lastEventAt ? (
              <p className="muted-line" style={{ marginTop: '8px' }}>
                Lần chấm gần nhất: {formatDateTime(dashboard.lastEventAt)}
              </p>
            ) : null}
          </Card>

          <div className="stats-grid">
            <Card title="Chuyên cần">
              <strong className="stat-number">{history.stats.totalWorkingDays}</strong>
            </Card>
            <Card title="Đúng giờ">
              <strong className="stat-number">{formatPercent(history.stats.onTimeRate)}</strong>
            </Card>
            <Card title="Tăng ca">
              <strong className="stat-number">{history.stats.totalOvertimeHours}h</strong>
            </Card>
            <Card title="Vắng">
              <strong className="stat-number">{history.stats.absences}</strong>
            </Card>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
          <Card
            className="timeline-card"
            title="Trạng thái & Tiến độ"
            description={dashboard.shift?.shiftName ?? 'Chưa đồng bộ ca làm'}
          >
            <div className="shift-meta">
              <span>{dashboard.shift?.onduty ?? '--:--'}</span>
              <span>{dashboard.shift?.offduty ?? '--:--'}</span>
            </div>

            <div className="timeline-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
              {dashboard.timeline.map((item) => (
                <div key={item.key} className={`timeline-item ${item.completed ? 'timeline-item--done' : ''}`}>
                  <span>{item.label}</span>
                  <strong>{item.time}</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {loading ? <p className="inline-message">Đang tải dữ liệu...</p> : null}
      {message ? (
        <p className={`inline-message ${message.ok ? 'inline-message--success' : 'inline-message--error'}`}>
          {message.message}
        </p>
      ) : null}
    </div>
  )
}
