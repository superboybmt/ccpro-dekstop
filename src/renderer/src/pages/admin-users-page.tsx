import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, LogOut, MonitorCog, RefreshCw, Search,
  ShieldCheck, UserCog, KeyRound, ShieldAlert,
  ChevronLeft, ChevronRight, X, AlertTriangle, CheckCircle2
} from 'lucide-react'
import type {
  AdminManagedUser, AdminManagedUserFilter, AdminManagedUserList,
  AdminResetUserPasswordPayload, AdminSessionState, AdminSetUserActivePayload, MutationResult
} from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

const STATUS_LABEL = {
  active: 'Đang hoạt động',
  inactive: 'Đã vô hiệu hóa'
} as const

const missingAdminUsersMessage =
  'Bản app hiện tại chưa hỗ trợ quản lý người dùng. Hãy mở lại app sau khi cập nhật build mới.'

type AdminUsersBridge = {
  listUsers(filter: AdminManagedUserFilter): Promise<AdminManagedUserList>
  setUserActiveState(payload: AdminSetUserActivePayload): Promise<MutationResult>
  resetUserPassword(payload: AdminResetUserPasswordPayload): Promise<MutationResult>
}

const resolveAdminUsersBridge = (): AdminUsersBridge | null => {
  const bridge = (window.ccpro as typeof window.ccpro & { adminUsers?: AdminUsersBridge }).adminUsers
  if (!bridge) return null
  if (typeof bridge.listUsers !== 'function') return null
  if (typeof bridge.setUserActiveState !== 'function') return null
  if (typeof bridge.resetUserPassword !== 'function') return null
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

  const handleLogout = async (): Promise<void> => {
    await window.ccpro.admin.logout()
    navigate('/admin/login', { replace: true })
  }

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return users.slice(startIndex, startIndex + PAGE_SIZE)
  }, [users, currentPage])

  const totalPages = Math.ceil(users.length / PAGE_SIZE)

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
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Mã NV</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Họ và tên</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Phòng ban</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)' }}>Trạng thái App</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--sidebar-text)', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user) => {
                    const busy = busyUserIds.includes(user.userEnrollNumber)
                    return (
                      <tr key={user.userEnrollNumber} style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.2s', cursor: 'default' }} onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
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
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ height: '34px', padding: '0 12px' }}
                    >
                      <ChevronLeft size={16} /> <span style={{ marginLeft: '4px' }}>Trước</span>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="md" 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
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

      {/* Custom Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1100,
          background: 'var(--bg-card)', border: '1px solid var(--line)',
          borderLeft: `4px solid ${toastMessage.ok ? 'var(--success)' : 'var(--danger)'}`,
          boxShadow: 'var(--shadow-glow)', borderRadius: 'var(--radius-md)',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px',
          minWidth: '300px', maxWidth: '400px', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {toastMessage.ok ? <CheckCircle2 size={24} color="var(--success)" /> : <AlertTriangle size={24} color="var(--danger)" />}
          <div style={{ flex: 1, fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.4' }}>
            {toastMessage.text}
          </div>
          <button onClick={() => setToastMessage(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        .icon-action-btn:hover { background: var(--bg-hover) !important; border-color: var(--primary) !important; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}} />
    </div>
  )
}
