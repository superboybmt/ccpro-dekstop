import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, LogOut, MonitorCog, RefreshCw, Search,
  ShieldCheck, UserCog, KeyRound, ShieldAlert,
  ChevronLeft, ChevronRight, X, AlertTriangle, CheckCircle2,
  CheckSquare, Square, Lock, Unlock, Unlink
} from 'lucide-react'
import type {
  AdminManagedUser, AdminManagedUserFilter, AdminManagedUserList,
  AdminResetUserPasswordPayload, AdminSessionState, AdminSetUserActivePayload,
  AdminBatchSetActivePayload, AdminBatchUnbindPayload,
  MutationResult, BatchMutationResult
} from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
const missingAdminUsersMessage =
  'Bản app hiện tại chưa hỗ trợ quản lý người dùng. Hãy mở lại app sau khi cập nhật build mới.'

type AdminUsersBridge = {
  listUsers(filter: AdminManagedUserFilter): Promise<AdminManagedUserList>
  setUserActiveState(payload: AdminSetUserActivePayload): Promise<MutationResult>
  resetUserPassword(payload: AdminResetUserPasswordPayload): Promise<MutationResult>
  unbindDevice(userEnrollNumber: number): Promise<MutationResult>
  batchSetActiveState(payload: AdminBatchSetActivePayload): Promise<BatchMutationResult>
  batchUnbindDevices(payload: AdminBatchUnbindPayload): Promise<BatchMutationResult>
}

const resolveAdminUsersBridge = (): AdminUsersBridge | null => {
  const bridge = (window.ccpro as typeof window.ccpro & { adminUsers?: AdminUsersBridge }).adminUsers
  if (!bridge) return null
  if (typeof bridge.listUsers !== 'function') return null
  if (typeof bridge.setUserActiveState !== 'function') return null
  if (typeof bridge.resetUserPassword !== 'function') return null
  if (typeof bridge.unbindDevice !== 'function') return null
  return bridge
}

const EmptyState = ({ query }: { query: string }): JSX.Element => (
  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', borderRadius: 'var(--radius-lg)' }}>
    {query ? 'Không tìm thấy người dùng phù hợp' : 'Chưa có dữ liệu người dùng'}
  </div>
)

const PAGE_SIZE = 12

export const AdminUsersPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [session, setSession] = useState<AdminSessionState | null>(null)
  const [users, setUsers] = useState<AdminManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const [toastMessage, setToastMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyUserIds, setBusyUserIds] = useState<number[]>([])
  
  const [resetTarget, setResetTarget] = useState<AdminManagedUser | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)
  
  const [confirmToggle, setConfirmToggle] = useState<{ user: AdminManagedUser; nextIsActive: boolean } | null>(null)
  
  const [adminUsersAvailable, setAdminUsersAvailable] = useState(false)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<{ type: 'activate' | 'deactivate' | 'unbind'; count: number } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const loadUsers = useCallback(
    async (nextQuery: string, options?: { silent?: boolean }) => {
      try {
        if (options?.silent) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const adminUsersBridge = resolveAdminUsersBridge()
        setAdminUsersAvailable(Boolean(adminUsersBridge))

        const adminSession = await window.ccpro.admin.getSession()
        if (!adminSession.authenticated) {
          navigate('/admin/login', { replace: true })
          return
        }

        if (adminSession.mustChangePassword) {
          navigate('/admin/account?forcePasswordChange=1', { replace: true })
          return
        }

        setSession(adminSession)
        setAppliedQuery(nextQuery)

        if (!adminUsersBridge) {
          setUsers([])
          showToast({ ok: false, text: missingAdminUsersMessage })
          return
        }

        const result = await adminUsersBridge.listUsers({ query: nextQuery })
        setUsers(result.users)
        setCurrentPage(1) // Reset to first page on new search
        setSelectedIds(new Set()) // Clear selection on search
      } catch (error) {
        showToast({
          ok: false,
          text: `Không thể tải danh sách người dùng: ${error instanceof Error ? error.message : String(error)}`
        })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [navigate]
  )

  useEffect(() => {
    void loadUsers('')
  }, [loadUsers])

  const showToast = (message: { ok: boolean; text: string }) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  const handleSearch = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault()
    if (!adminUsersAvailable) return
    await loadUsers(query.trim(), { silent: true })
  }

  const executeToggleActive = async (): Promise<void> => {
    if (!confirmToggle) return
    const { user, nextIsActive } = confirmToggle
    
    const adminUsersBridge = resolveAdminUsersBridge()
    if (!adminUsersBridge) {
      setAdminUsersAvailable(false)
      showToast({ ok: false, text: missingAdminUsersMessage })
      setConfirmToggle(null)
      return
    }

    setBusyUserIds((current) => [...current, user.userEnrollNumber])
    setConfirmToggle(null)

    try {
      const result = await adminUsersBridge.setUserActiveState({
        userEnrollNumber: user.userEnrollNumber,
        isActive: nextIsActive
      })

      showToast({ ok: result.ok, text: result.message })
      if (result.ok) {
        await loadUsers(appliedQuery, { silent: true })
      }
    } catch (error) {
      showToast({
        ok: false,
        text: `Không thể cập nhật trạng thái tài khoản: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setBusyUserIds((current) => current.filter((id) => id !== user.userEnrollNumber))
    }
  }

  const handleResetPassword = async (): Promise<void> => {
    if (!resetTarget) return

    const adminUsersBridge = resolveAdminUsersBridge()
    if (!adminUsersBridge) {
      setAdminUsersAvailable(false)
      showToast({ ok: false, text: missingAdminUsersMessage })
      return
    }

    setResetSubmitting(true)

    try {
      const result = await adminUsersBridge.resetUserPassword({
        userEnrollNumber: resetTarget.userEnrollNumber,
        temporaryPassword
      })

      showToast({ ok: result.ok, text: result.message })
      if (result.ok) {
        setResetTarget(null)
        setTemporaryPassword('')
        await loadUsers(appliedQuery, { silent: true })
      }
    } catch (error) {
      showToast({
        ok: false,
        text: `Không thể reset mật khẩu: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setResetSubmitting(false)
    }
  }

  const handleUnbindDevice = async (user: AdminManagedUser): Promise<void> => {
    const adminUsersBridge = resolveAdminUsersBridge()
    if (!adminUsersBridge) {
      setAdminUsersAvailable(false)
      showToast({ ok: false, text: missingAdminUsersMessage })
      return
    }

    setBusyUserIds((current) => [...current, user.userEnrollNumber])

    try {
      const result = await adminUsersBridge.unbindDevice(user.userEnrollNumber)
      showToast({ ok: result.ok, text: result.message })
      if (result.ok) {
        await loadUsers(appliedQuery, { silent: true })
      }
    } catch (error) {
      showToast({
        ok: false,
        text: `Không thể gỡ liên kết thiết bị: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setBusyUserIds((current) => current.filter((id) => id !== user.userEnrollNumber))
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.ccpro.admin.logout()
    navigate('/admin/login', { replace: true })
  }

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return users.slice(startIndex, startIndex + PAGE_SIZE)
  }, [users, currentPage])

  const totalPages = Math.ceil(users.length / PAGE_SIZE)

  // Selection helpers
  const isAllPageSelected = paginatedUsers.length > 0 && paginatedUsers.every(u => selectedIds.has(u.userEnrollNumber))
  const hasSelection = selectedIds.size > 0

  const toggleSelectAll = (): void => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (isAllPageSelected) {
        paginatedUsers.forEach(u => next.delete(u.userEnrollNumber))
      } else {
        paginatedUsers.forEach(u => next.add(u.userEnrollNumber))
      }
      return next
    })
  }

  const toggleSelectOne = (userEnrollNumber: number): void => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(userEnrollNumber)) {
        next.delete(userEnrollNumber)
      } else {
        next.add(userEnrollNumber)
      }
      return next
    })
  }

  const handlePageChange = (nextPage: number): void => {
    setCurrentPage(nextPage)
    setSelectedIds(new Set()) // Clear selection on page change
  }

  const executeBulkAction = async (): Promise<void> => {
    if (!bulkConfirm) return
    const adminUsersBridge = resolveAdminUsersBridge()
    if (!adminUsersBridge) {
      setAdminUsersAvailable(false)
      showToast({ ok: false, text: missingAdminUsersMessage })
      setBulkConfirm(null)
      return
    }

    setBulkBusy(true)
    try {
      let result: BatchMutationResult
      const ids = Array.from(selectedIds)
      if (bulkConfirm.type === 'activate') {
        result = await adminUsersBridge.batchSetActiveState({ userEnrollNumbers: ids, isActive: true })
      } else if (bulkConfirm.type === 'deactivate') {
        result = await adminUsersBridge.batchSetActiveState({ userEnrollNumbers: ids, isActive: false })
      } else {
        result = await adminUsersBridge.batchUnbindDevices({ userEnrollNumbers: ids })
      }

      showToast({ ok: result.ok, text: result.message })
      if (result.ok) {
        setSelectedIds(new Set())
        await loadUsers(appliedQuery, { silent: true })
      }
    } catch (error) {
      showToast({
        ok: false,
        text: `Lỗi thực hiện hàng loạt: ${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setBulkBusy(false)
      setBulkConfirm(null)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-loading-container">
          <Loader2 className="admin-spinner" size={32} style={{ color: 'var(--primary-strong)' }} />
          <p className="inline-message">Đang tải danh sách người dùng...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page" style={{ position: 'relative', minHeight: '100vh', paddingBottom: '60px' }}>
      <div className="admin-page__header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCog size={24} style={{ color: 'var(--primary)' }} />
            Quản lý ứng dụng
          </h1>
          {session?.admin && (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', margin: '4px 0 0 0' }}>
              Đăng nhập: {session.admin.displayName} ({session.admin.username})
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" size="md" onClick={() => navigate('/admin/account')}>
            <ShieldCheck size={16} />
            <span style={{ marginLeft: '6px' }}>Tài khoản</span>
          </Button>
          <Button variant="secondary" size="md" onClick={() => navigate('/admin/device-config')}>
            <MonitorCog size={16} />
            <span style={{ marginLeft: '6px' }}>Máy chấm công</span>
          </Button>
          <Button variant="secondary" size="md" onClick={handleLogout} title="Đăng xuất">
            <LogOut size={16} style={{ color: 'var(--danger-strong)' }} />
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {/* Full-width Compact Filter Bar */}
        <div style={{
          background: 'var(--bg-card)', 
          padding: '12px 16px', 
          borderRadius: 'var(--radius-lg)', 
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '300px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Tìm mã NV, họ tên..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!adminUsersAvailable}
                style={{ paddingLeft: '36px', height: '40px', width: '100%', margin: 0 }}
              />
            </div>
            <Button type="submit" size="md" disabled={!adminUsersAvailable} style={{ height: '40px' }}>
              Tìm kiếm
            </Button>
          </form>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {users.filter(u => u.appActive).length} / {users.length} tài khoản hoạt động
            </div>
            <Button
              variant="ghost"
              size="md"
              onClick={() => void loadUsers(appliedQuery, { silent: true })}
              disabled={refreshing || !adminUsersAvailable}
              style={{ height: '40px' }}
              title="Làm mới dữ liệu"
            >
              <RefreshCw size={16} className={refreshing ? 'top-header__sync-spin' : ''} />
            </Button>
          </div>
        </div>

        {resetTarget && (
          <Card
            title={`Reset mật khẩu: ${resetTarget.fullName}`}
            description="Mật khẩu sẽ được yêu cầu đổi lại ở lần đăng nhập tới"
            style={{ borderLeft: '4px solid var(--warning)' }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginTop: '12px' }}>
              <Input
                type="password"
                placeholder="Nhập mật khẩu tạm (>= 6 ký tự)"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                style={{ flex: 1, maxWidth: '300px' }}
              />
              <Button size="md" onClick={handleResetPassword} disabled={resetSubmitting} style={{ height: '40px' }}>
                <ShieldCheck size={16} />
                <span style={{ marginLeft: '6px' }}>{resetSubmitting ? 'Đang lưu...' : 'Xác nhận reset'}</span>
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setResetTarget(null)
                  setTemporaryPassword('')
                }}
                disabled={resetSubmitting}
                style={{ height: '40px' }}
              >
                Hủy
              </Button>
            </div>
          </Card>
        )}

        {/* Bulk Action Bar */}
        {hasSelection && (
          <div style={{
            background: 'var(--primary)', color: 'white',
            padding: '10px 16px', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
          }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              Đã chọn {selectedIds.size} người dùng
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="md"
                style={{ height: '34px', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
                onClick={() => setBulkConfirm({ type: 'deactivate', count: selectedIds.size })}
                disabled={bulkBusy}
              >
                <Lock size={14} />
                <span style={{ marginLeft: '4px' }}>Khóa tất cả</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                style={{ height: '34px', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
                onClick={() => setBulkConfirm({ type: 'activate', count: selectedIds.size })}
                disabled={bulkBusy}
              >
                <Unlock size={14} />
                <span style={{ marginLeft: '4px' }}>Mở tất cả</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                style={{ height: '34px', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none' }}
                onClick={() => setBulkConfirm({ type: 'unbind', count: selectedIds.size })}
                disabled={bulkBusy}
              >
                <Unlink size={14} />
                <span style={{ marginLeft: '4px' }}>Gỡ thiết bị</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                style={{ height: '34px', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkBusy}
              >
                <X size={14} />
                <span style={{ marginLeft: '4px' }}>Bỏ chọn</span>
              </Button>
            </div>
          </div>
        )}

        <div style={{
          background: 'var(--bg-card)', 
          borderRadius: 'var(--radius-lg)', 
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden'
        }}>
          {users.length === 0 ? (
            <EmptyState query={appliedQuery} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', whiteSpace: 'nowrap' }}>
                <thead style={{ background: 'var(--sidebar-bg)' }}>
                  <tr>
                    <th style={{ padding: '14px 12px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)', width: '44px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-text)', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={isAllPageSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả trang này'}
                      >
                        {isAllPageSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Mã NV</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Họ và tên</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Phòng ban</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Thiết bị</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Trạng thái App</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user) => {
                    const busy = busyUserIds.includes(user.userEnrollNumber)
                    const isSelected = selectedIds.has(user.userEnrollNumber)
                    return (
                      <tr key={user.userEnrollNumber} style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.2s', cursor: 'default', background: isSelected ? 'rgba(59, 130, 246, 0.06)' : 'transparent' }} onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ padding: '14px 12px', textAlign: 'center', width: '44px' }}>
                          <button
                            type="button"
                            onClick={() => toggleSelectOne(user.userEnrollNumber)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{user.employeeCode}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'grid', gap: '2px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{user.fullName}</span>
                            {user.scheduleName && (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{user.scheduleName}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{user.department ?? '--'}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'grid', gap: '2px' }}>
                            <span style={{ fontWeight: 600, color: user.boundHardwareId ? 'var(--text-main)' : 'var(--text-muted)' }}>
                              {user.boundHardwareId ? 'Đã gắn thiết bị' : 'Chưa gắn thiết bị'}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {user.boundHardwareId ? user.boundHardwareId.slice(0, 12) : '--'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: '6px', 
                            padding: '4px 10px', borderRadius: 'var(--radius-full)', 
                            fontSize: '12px', fontWeight: 600,
                            background: user.appActive ? 'rgba(29, 175, 92, 0.12)' : 'rgba(229, 69, 58, 0.08)',
                            color: user.appActive ? 'var(--success-strong)' : 'var(--danger-strong)'
                          }}>
                            {user.appActive ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                            {user.appActive ? 'Hoạt động' : 'Tạm khóa'}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <Button
                              type="button"
                              className="icon-action-btn"
                              style={{ 
                                height: '34px', width: '34px', padding: 0, 
                                background: 'transparent',
                                border: '1px solid var(--line)',
                                color: user.appActive ? 'var(--danger-strong)' : 'var(--success-strong)'
                              }}
                              title={user.appActive ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
                              onClick={() => setConfirmToggle({ user, nextIsActive: !user.appActive })}
                              disabled={busy || !adminUsersAvailable}
                            >
                              {busy ? <Loader2 size={16} className="top-header__sync-spin" /> : (
                                user.appActive ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />
                              )}
                            </Button>
                            <Button
                              type="button"
                              className="icon-action-btn"
                              style={{ 
                                height: '34px', width: '34px', padding: 0, 
                                background: 'transparent',
                                border: '1px solid var(--line)',
                                color: 'var(--primary)'
                              }}
                              title="Reset mật khẩu"
                              onClick={() => {
                                setResetTarget(user)
                                setTemporaryPassword('')
                              }}
                              disabled={!adminUsersAvailable}
                            >
                              <KeyRound size={16} />
                            </Button>
                            <Button
                              type="button"
                              className="icon-action-btn"
                              style={{
                                height: '34px', width: '34px', padding: 0,
                                background: 'transparent',
                                border: '1px solid var(--line)',
                                color: user.boundHardwareId ? 'var(--warning-strong)' : 'var(--text-muted)'
                              }}
                              title="Gỡ liên kết thiết bị"
                              onClick={() => void handleUnbindDevice(user)}
                              disabled={!adminUsersAvailable || !user.boundHardwareId || busy}
                            >
                              <X size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination UI */}
              {totalPages > 1 && (
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  padding: '12px 16px', borderTop: '1px solid var(--line)', background: 'var(--bg-card)' 
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Trang <strong style={{color: 'var(--text-main)'}}>{currentPage}</strong> / {totalPages}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      variant="ghost" 
                      size="md" 
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      style={{ height: '34px', padding: '0 12px' }}
                    >
                      <ChevronLeft size={16} /> <span style={{ marginLeft: '4px' }}>Trước</span>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="md" 
                      onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      style={{ height: '34px', padding: '0 12px' }}
                    >
                      <span style={{ marginRight: '4px' }}>Sau</span> <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom Alert Dialog for Actions */}
      {confirmToggle && (
        <div
          className="admin-users__dialog-overlay"
          style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        >
          <div style={{
            background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-xl)',
            width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid var(--line)', display: 'grid', gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: confirmToggle.nextIsActive ? 'var(--success-strong)' : 'var(--danger-strong)' }}>
              {confirmToggle.nextIsActive ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
                {confirmToggle.nextIsActive ? 'Kích hoạt tài khoản' : 'Khóa tài khoản'}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Bạn có chắc chắn muốn {confirmToggle.nextIsActive ? 'kích hoạt lại' : 'tạm khóa'} tài khoản App của nhân viên <strong>{confirmToggle.user.fullName}</strong> ({confirmToggle.user.employeeCode})?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button variant="ghost" onClick={() => setConfirmToggle(null)}>Hủy bỏ</Button>
              <Button 
                variant="primary" 
                onClick={executeToggleActive} 
                style={confirmToggle.nextIsActive ? {} : { background: 'var(--danger)', boxShadow: '0 8px 24px -6px rgba(229, 69, 58, 0.3)' }}
              >
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Confirmation Dialog */}
      {bulkConfirm && (
        <div
          className="admin-users__dialog-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-xl)',
            width: '420px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid var(--line)', display: 'grid', gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: bulkConfirm.type === 'activate' ? 'var(--success-strong)' : 'var(--warning-strong)' }}>
              {bulkConfirm.type === 'activate' ? <Unlock size={28} /> : bulkConfirm.type === 'deactivate' ? <Lock size={28} /> : <Unlink size={28} />}
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
                {bulkConfirm.type === 'activate' ? 'Kích hoạt hàng loạt' : bulkConfirm.type === 'deactivate' ? 'Khóa hàng loạt' : 'Gỡ thiết bị hàng loạt'}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Bạn có chắc chắn muốn {bulkConfirm.type === 'activate' ? 'kích hoạt' : bulkConfirm.type === 'deactivate' ? 'tạm khóa' : 'gỡ liên kết thiết bị của'}{' '}
              <strong>{bulkConfirm.count} người dùng</strong> đã chọn?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button variant="ghost" onClick={() => setBulkConfirm(null)} disabled={bulkBusy}>Hủy bỏ</Button>
              <Button
                variant="primary"
                onClick={executeBulkAction}
                disabled={bulkBusy}
                style={bulkConfirm.type === 'deactivate' ? { background: 'var(--danger)', boxShadow: '0 8px 24px -6px rgba(229, 69, 58, 0.3)' } : {}}
              >
                {bulkBusy ? <Loader2 size={16} className="top-header__sync-spin" /> : null}
                <span style={{ marginLeft: bulkBusy ? '6px' : '0' }}>{bulkBusy ? 'Đang xử lý...' : 'Xác nhận'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification */}
      {toastMessage && (
        <div
          className="admin-users__toast"
          style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1100,
          background: 'var(--bg-card)', border: '1px solid var(--line)',
          borderLeft: `4px solid ${toastMessage.ok ? 'var(--success)' : 'var(--danger)'}`,
          boxShadow: 'var(--shadow-glow)', borderRadius: 'var(--radius-md)',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px',
          minWidth: '300px', maxWidth: '400px'
        }}
        >
          {toastMessage.ok ? <CheckCircle2 size={24} color="var(--success)" /> : <AlertTriangle size={24} color="var(--danger)" />}
          <div style={{ flex: 1, fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.4' }}>
            {toastMessage.text}
          </div>
          <button onClick={() => setToastMessage(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
