import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { History, RefreshCw } from 'lucide-react'
import type { HistoryData } from '@shared/api'
import { formatAppMonthKey } from '@shared/app-time'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { DatePicker } from '@renderer/components/ui/date-picker'
import { MonthPicker } from '@renderer/components/ui/month-picker'
import { toUiErrorMessage } from '@renderer/lib/errors'
import { formatPercent } from '@renderer/lib/format'
import { StatusPill } from '@renderer/components/ui/status-pill'

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
    lateDays: 0,
    avgWorkingHoursPerDay: 0
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
  const isCustomRangeActive = Boolean(startDate && endDate)

  const setMonthFilter = (nextMonth: string | null): void => {
    if (!nextMonth) return
    setSearchParams({ month: nextMonth, page: '1' }, { replace: false })
  }

  const setRangeFilter = (nextStartDate: string | null, nextEndDate: string | null): void => {
    const nextParams: Record<string, string> = { page: '1' }

    if (nextStartDate) nextParams.start = nextStartDate
    if (nextEndDate) nextParams.end = nextEndDate

    if (!nextStartDate && !nextEndDate) {
      nextParams.month = currentMonth
    }

    setSearchParams(nextParams, { replace: false })
  }

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
    <div
      className="page-wrapper"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-document)'
      }}
    >
      <div
        className="page-header"
        style={{
          flexShrink: 0,
          padding: '16px 16px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 600,
              color: 'var(--text-main)',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <History size={24} style={{ color: 'var(--primary)' }} />
            Lịch sử chấm công
          </h1>
        </div>

        <div className="history-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <MonthPicker
            ariaLabel="Tháng chấm công"
            className="history-filters__month"
            value={isCustomRangeActive ? null : month}
            onChange={setMonthFilter}
          />

          <div className="history-filters__range">
            <DatePicker
              ariaLabel="Từ ngày"
              className="history-filters__date"
              nullable
              value={startDate || null}
              onChange={(nextStartDate) => setRangeFilter(nextStartDate, endDate || null)}
            />
            <span style={{ color: 'var(--text-muted)' }}>-</span>
            <DatePicker
              ariaLabel="Đến ngày"
              className="history-filters__date"
              nullable
              value={endDate || null}
              onChange={(nextEndDate) => setRangeFilter(startDate || null, nextEndDate)}
            />
          </div>

          <Button
            variant="ghost"
            aria-label="Đặt lại bộ lọc thời gian"
            onClick={() => setSearchParams({ month: currentMonth, page: '1' }, { replace: false })}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      <div
        className="page-content"
        style={{
          flex: 1,
          minHeight: 0,
          padding: '0 16px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            flexShrink: 0
          }}
        >
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>
              Tổng ngày công
            </div>
            <strong style={{ fontSize: '20px', fontWeight: 600 }}>
              {history.stats.totalWorkingDays}
            </strong>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>
              Tỷ lệ đi đúng giờ
            </div>
            <strong style={{ fontSize: '20px', fontWeight: 600, color: 'var(--primary)' }}>
              {formatPercent(history.stats.onTimeRate)}
            </strong>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>
              Ngày đi trễ
            </div>
            <strong style={{ fontSize: '20px', fontWeight: 600 }}>
              {history.stats.lateDays}
            </strong>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div className="muted-line" style={{ marginBottom: '8px' }}>
              Giờ làm trung bình
            </div>
            <strong style={{ fontSize: '20px', fontWeight: 600 }}>
              {history.stats.avgWorkingHoursPerDay}h
            </strong>
          </Card>
        </div>

        <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {loading ? (
            <div style={{ padding: '24px' }}>
              <p className="muted-line">Đang tải dữ liệu...</p>
            </div>
          ) : null}
          {error ? (
            <div style={{ padding: '24px' }}>
              <p className="inline-message inline-message--error">{error}</p>
            </div>
          ) : null}

          {!loading && history.records.length === 0 ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <History
                size={48}
                style={{ color: 'var(--border-default)', margin: '0 auto 16px auto' }}
              />
              <p className="muted-line">Không có dữ liệu chấm công trong khoảng thời gian này</p>
            </div>
          ) : null}

          {history.records.length > 0 ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--bg-card)',
                    zIndex: 1
                  }}
                >
                  <tr>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Ngày
                    </th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Vào 1
                    </th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Ra 1
                    </th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Vào 2
                    </th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Ra 2
                    </th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-default)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.records.map((record) => (
                    <tr key={`${record.date}-${record.checkIn1}`} style={{ borderBottom: '1px solid var(--bg-hover)' }}>
                      <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 500 }}>
                        {record.date}
                      </td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.checkIn1}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.checkOut1}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.checkIn2}</td>
                      <td style={{ padding: '16px 24px', fontSize: '14px' }}>{record.checkOut2}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <StatusPill status={record.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div
            className="table-footer"
            style={{
              flexShrink: 0,
              padding: '16px 24px',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-card)'
            }}
          >
            <span className="muted-line" style={{ fontSize: '13px' }}>
              Trang {history.filter.page} / {Math.max(1, Math.ceil(history.total / history.filter.pageSize))}
            </span>
            <div className="table-footer__actions" style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                disabled={history.filter.page <= 1}
                onClick={() =>
                  setSearchParams({ ...Object.fromEntries(searchParams), page: String(page - 1) })
                }
              >
                Trước
              </Button>
              <Button
                variant="ghost"
                disabled={page * history.filter.pageSize >= history.total}
                onClick={() =>
                  setSearchParams({ ...Object.fromEntries(searchParams), page: String(page + 1) })
                }
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
