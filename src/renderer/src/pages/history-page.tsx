import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { HistoryData } from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { toUiErrorMessage } from '@renderer/lib/errors'
import { StatusPill } from '@renderer/components/ui/status-pill'
import { formatPercent } from '@renderer/lib/format'
import { History, RefreshCw } from 'lucide-react'
import { formatAppMonthKey } from '@shared/app-time'

const EMPTY_HISTORY: HistoryData = {
  filter: {
    month: null,
    startDate: '',
    endDate: '',
    page: 1,
    pageSize: 10
  },
  stats: {
    totalWorkingDays: 0,
    onTimeRate: 0,
    totalOvertimeHours: 0,
    absences: 0
  },
  records: [],
  total: 0
}

const currentMonth = formatAppMonthKey(new Date())

export const HistoryPage = (): JSX.Element => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [history, setHistory] = useState<HistoryData>(EMPTY_HISTORY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const month = searchParams.get('month') ?? currentMonth
  const startDate = searchParams.get('start') ?? ''
  const endDate = searchParams.get('end') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  useEffect(() => {
    if (!searchParams.get('month') && !searchParams.get('start')) {
      setSearchParams({ month: currentMonth, page: '1' }, { replace: true })
      return
    }

    setLoading(true)
    setError(null)

    window.ccpro.attendance
      .getHistory({
        month: startDate && endDate ? undefined : month,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        pageSize: 15
      })
      .then((result) => setHistory(result))
      .catch((reason) => setError(toUiErrorMessage(reason, 'Không tải được lịch sử')))
      .finally(() => setLoading(false))
  }, [month, startDate, endDate, page, searchParams, setSearchParams])

  return (
    <div className="page-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-document)' }}>
      {/* HEADER ROW */}
      <div className="page-header" style={{ flexShrink: 0, padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={24} style={{ color: 'var(--primary)' }} />
            Lịch sử chấm công
          </h1>
        </div>

        <div className="history-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="mini-input"
            type="month"
            value={startDate && endDate ? '' : month}
            onChange={(event) =>
              setSearchParams({ month: event.target.value, page: '1' }, { replace: false })
            }
          />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', backgroundColor: 'var(--bg-hover)', padding: '2px', borderRadius: '4px' }}>
            <input
              className="mini-input"
              type="date"
              value={startDate}
              onChange={(event) =>
                setSearchParams(
                  {
                    start: event.target.value,
                    end: endDate,
                    page: '1'
                  },
                  { replace: false }
                )
              }
              style={{ border: 'none', backgroundColor: 'transparent' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>-</span>
            <input
              className="mini-input"
              type="date"
              value={endDate}
              onChange={(event) =>
                setSearchParams(
                  {
                    start: startDate,
                    end: event.target.value,
                    page: '1'
                  },
                  { replace: false }
                )
              }
              style={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => setSearchParams({ month: currentMonth, page: '1' }, { replace: false })}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="page-content" style={{ flex: 1, minHeight: 0, padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* STATS OVERVIEW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', flexShrink: 0 }}>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>Tổng ngày công</div>
            <strong style={{ fontSize: '20px', fontWeight: 600 }}>{history.stats.totalWorkingDays}</strong>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>Tỷ lệ đi đúng giờ</div>
            <strong style={{ fontSize: '20px', fontWeight: 600, color: 'var(--primary)' }}>{formatPercent(history.stats.onTimeRate)}</strong>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>Tổng giờ tăng ca</div>
            <strong style={{ fontSize: '20px', fontWeight: 600 }}>{history.stats.totalOvertimeHours}h</strong>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>Số lần nghỉ phép</div>
            <strong style={{ fontSize: '20px', fontWeight: 600, color: history.stats.absences > 0 ? 'var(--text-error)' : 'inherit' }}>{history.stats.absences}</strong>
          </Card>
        </div>

        {/* DATA TABLE AREA */}
        <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {loading ? <div style={{ padding: '24px' }}><p className="muted-line">Đang tải dữ liệu...</p></div> : null}
          {error ? <div style={{ padding: '24px' }}><p className="inline-message inline-message--error">{error}</p></div> : null}

          {!loading && history.records.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <History size={48} style={{ color: 'var(--border-default)', margin: '0 auto 16px auto' }} />
              <p className="muted-line">Không có dữ liệu chấm công trong khoảng thời gian này</p>
            </div>
          ) : null}

          {history.records.length > 0 ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Ngày</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Vào</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Ra</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tổng giờ</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Ca làm</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {history.records.map((record) => (
                    <tr key={`${record.date}-${record.checkIn}`} style={{ borderBottom: '1px solid var(--bg-hover)' }}>
                      <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 500 }}>{record.date}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.checkIn}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.checkOut}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.totalHours}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }} className="muted-line">{record.shiftName}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <StatusPill status={record.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* PINNED FOOTER */}
          <div className="table-footer" style={{ flexShrink: 0, padding: '16px 24px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)' }}>
            <span className="muted-line" style={{ fontSize: '13px' }}>
              Trang {history.filter.page} / {Math.max(1, Math.ceil(history.total / history.filter.pageSize))}
            </span>
            <div className="table-footer__actions" style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                disabled={history.filter.page <= 1}
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), page: String(page - 1) })}
              >
                Trước
              </Button>
              <Button
                variant="ghost"
                disabled={page * history.filter.pageSize >= history.total}
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), page: String(page + 1) })}
              >
                Sau
              </Button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
