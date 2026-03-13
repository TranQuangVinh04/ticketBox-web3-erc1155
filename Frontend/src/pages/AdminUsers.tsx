import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { listUsers, updateUserRole, type AdminUserItem, type UserRole } from '../api/users'
import { apiFetch } from '../api/http'
import { listActivity, type ActivityItem } from '../api/analytics'

function shortAddress(addr: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ROLE_LABELS: Record<UserRole, string> = {
  USER: 'Người dùng',
  STAFF: 'Nhân viên',
  OWNER: 'Chủ sở hữu',
}

const ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN: 'Đăng nhập',
  PURCHASE_SET: 'Mua vé',
  TICKET_CHECKIN: 'Check-in',
  ADMIN_UPSERT_EVENT_DISPLAY: 'Admin: sửa event hiển thị',
  ADMIN_DELETE_EVENT_DISPLAY: 'Admin: ẩn event',
  ADMIN_RESTORE_EVENT_DISPLAY: 'Admin: khôi phục event',
  ADMIN_UPDATE_USER_ROLE: 'Admin: đổi role user',
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AdminUsersContent({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const limit = 20

  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotalPages, setActivityTotalPages] = useState(0)
  const [activityActionFilter, setActivityActionFilter] = useState<string>('')
  const [activityWalletFilter, setActivityWalletFilter] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users')

  const canChangeRole = currentUserRole === 'OWNER'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listUsers({ q: searchDebounced || undefined, page, limit })
      setUsers(res.users)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setUsers([])
      setTotal(0)
      setTotalPages(0)
    } finally {
      setLoading(false)
    }
  }, [searchDebounced, page, limit])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [searchDebounced])

  useEffect(() => {
    let cancelled = false
    apiFetch<{ user?: { role?: string } }>('/me', { method: 'GET' })
      .then((data) => {
        if (!cancelled && data?.user?.role) setCurrentUserRole(data.user.role as UserRole)
      })
      .catch(() => {
        if (!cancelled) setCurrentUserRole(null)
      })
    return () => { cancelled = true }
  }, [])

  const handleRoleChange = async (user: AdminUserItem, newRole: UserRole) => {
    if (user.role === newRole) return
    setUpdatingId(user.id)
    try {
      await updateUserRole(user.id, newRole)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdatingId(null)
    }
  }

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError(null)
    try {
      const data = await listActivity({
        page: activityPage,
        limit: 10,
        action: activityActionFilter || undefined,
        wallet: activityWalletFilter || undefined,
      })
      setActivity(data.items || [])
      setActivityTotalPages(data.totalPages || 0)
    } catch (e) {
      setActivity([])
      setActivityError(e instanceof Error ? e.message : String(e))
    } finally {
      setActivityLoading(false)
    }
  }, [activityPage, activityActionFilter, activityWalletFilter])

  useEffect(() => {
    void loadActivity()
  }, [loadActivity])

  const handleChangeActivityAction = (value: string) => {
    setActivityPage(1)
    setActivityActionFilter(value)
  }

  const handleChangeActivityWallet = (value: string) => {
    setActivityPage(1)
    setActivityWalletFilter(value)
  }

  const handleViewUserActivity = (wallet: string) => {
    if (!wallet) return
    setActiveTab('logs')
    setActivityWalletFilter(wallet)
    setActivityPage(1)
  }

  return (
    <div
      className={embedded ? '' : 'min-h-screen bg-linear-to-b from-[#1e3a5f]/60 via-[#3d2817]/60 to-[#1e3a5f]/60'}
      style={embedded ? undefined : { fontFamily: "'Lora', serif" }}
    >
      {!embedded && <Header />}

      <main
        className={
          embedded
            ? 'max-w-[1200px] mx-auto px-0 py-4'
            : 'max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-10'
        }
      >
        {!embedded && (
          <div className="mb-6 rounded-2xl border border-[#5c4033]/50 bg-[#3d2817]/55 backdrop-blur-md p-4 sm:p-6 flex items-center justify-between">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold text-[#f4d03f]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Admin • Quản Lý Người Dùng
              </h1>
              <p className="mt-1 text-sm text-[#e8e0d0]/80">
                Quản lý tài khoản và xem lịch sử hoạt động theo ví.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-4 py-2 rounded-lg border border-[#5c4033]/60 bg-[#3d2817]/60 text-[#e8e0d0] hover:bg-[#5c4033]/60"
            >
              Về Admin
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
              activeTab === 'users'
                ? 'bg-[#f4d03f] text-black border-[#f4d03f]'
                : 'bg-[#3d2817]/70 text-[#e8e0d0] border-[#5c4033]/60 hover:bg-[#5c4033]/60'
            }`}
          >
            Người dùng hiện tại
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
              activeTab === 'logs'
                ? 'bg-[#f4d03f] text-black border-[#f4d03f]'
                : 'bg-[#3d2817]/70 text-[#e8e0d0] border-[#5c4033]/60 hover:bg-[#5c4033]/60'
            }`}
          >
            Log người dùng
          </button>
        </div>

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="rounded-2xl border border-[#5c4033]/50 bg-[#2a1c11]/70 backdrop-blur-md p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <input
                type="text"
                placeholder="Tìm theo ví hoặc tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#5c4033]/60 bg-black/20 text-[#f5f1e8] placeholder-[#e8e0d0]/50 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50"
              />
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl border border-[#d4af37]/50 bg-[#3d2817]/60 text-[#f4d03f] hover:bg-[#5c4033]/60 disabled:opacity-60"
              >
                {loading ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-[#5c4033]/50 bg-black/15 p-3 inline-block">
              <span className="text-xs text-[#e8e0d0]/70">Tổng người dùng: </span>
              <span className="text-lg font-bold text-[#f5f1e8]">{total}</span>
            </div>

            {error && (
              <div className="mb-4 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-[#fecaca] text-sm">
                {error}
              </div>
            )}

            {loading && users.length === 0 ? (
              <div className="py-8 text-center text-[#e8e0d0]/80">Đang tải danh sách người dùng...</div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-[#e8e0d0]/80">Không tìm thấy người dùng nào.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#5c4033]/50">
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Ví</th>
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Tên</th>
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Role</th>
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Số vé đã mua</th>
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Đăng nhập gần nhất</th>
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Ngày tạo</th>
                      <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Hoạt động</th>
                      {canChangeRole && <th className="py-3 px-2 text-xs sm:text-sm font-semibold text-[#f4d03f]">Đổi role</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-[#5c4033]/30 hover:bg-[#5c4033]/20">
                        <td className="py-3 px-2 text-sm text-[#e8e0d0] font-mono">
                          <span title={u.walletAddress}>{shortAddress(u.walletAddress)}</span>
                        </td>
                        <td className="py-3 px-2 text-sm text-[#f5f1e8]">{u.name || '—'}</td>
                        <td className="py-3 px-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              u.role === 'OWNER'
                                ? 'border border-[#f4d03f]/60 text-[#f4d03f] bg-[#f4d03f]/15'
                                : u.role === 'STAFF'
                                  ? 'border border-[#60a5fa]/60 text-[#bfdbfe] bg-[#60a5fa]/15'
                                  : 'border border-[#5c4033]/60 text-[#e8e0d0] bg-[#5c4033]/20'
                            }`}
                          >
                            {ROLE_LABELS[u.role]}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-sm text-[#e8e0d0]">{u.totalTickets ?? 0}</td>
                        <td className="py-3 px-2 text-sm text-[#e8e0d0]/85">{formatDate(u.lastLoginAt)}</td>
                        <td className="py-3 px-2 text-sm text-[#e8e0d0]/85">{formatDate(u.createdAt)}</td>
                        <td className="py-3 px-2">
                          <button
                            type="button"
                            onClick={() => handleViewUserActivity(u.walletAddress)}
                            className="px-3 py-1 rounded-lg border border-[#5c4033]/60 text-xs sm:text-sm text-[#f4d03f] hover:bg-[#5c4033]/40"
                          >
                            Xem log
                          </button>
                        </td>
                        {canChangeRole && (
                          <td className="py-3 px-2">
                            <select
                              value={u.role}
                              onChange={(e) => void handleRoleChange(u, e.target.value as UserRole)}
                              disabled={updatingId === u.id}
                              className="px-2 py-1 rounded border border-[#5c4033]/60 bg-[#3d2817]/60 text-[#f5f1e8] text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 disabled:opacity-60"
                            >
                              {(['USER', 'STAFF', 'OWNER'] as const).map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 text-[#e8e0d0] hover:bg-[#5c4033]/40 disabled:opacity-50"
                >
                  Trước
                </button>
                <span className="text-sm text-[#e8e0d0]/80">
                  Trang {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 text-[#e8e0d0] hover:bg-[#5c4033]/40 disabled:opacity-50"
                >
                  Sau
                </button>
              </div>
            )}
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="rounded-2xl border border-[#5c4033]/60 bg-[#2a1c11]/70 backdrop-blur-md p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="text-lg sm:text-xl font-bold text-[#f5f1e8]" style={{ fontFamily: "'Playfair Display', serif" }}>
                Hoạt động gần đây
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={activityWalletFilter}
                  onChange={(e) => handleChangeActivityWallet(e.target.value)}
                  placeholder="Lọc theo ví (0x...)"
                  className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 bg-black/30 text-xs sm:text-sm text-[#f5f1e8] placeholder:text-[#e8e0d0]/50 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50"
                />
                <select
                  value={activityActionFilter}
                  onChange={(e) => handleChangeActivityAction(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 bg-black/30 text-xs sm:text-sm text-[#f5f1e8] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50"
                >
                  <option value="">Tất cả hành động</option>
                  {Object.entries(ACTION_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {activityError && (
              <div className="mb-3 text-xs text-[#fecaca]">Không tải được log: {activityError}</div>
            )}
            {activityLoading && activity.length === 0 ? (
              <div className="text-sm text-[#e8e0d0]/80">Đang tải log hoạt động...</div>
            ) : activity.length === 0 ? (
              <div className="text-sm text-[#e8e0d0]/80">Chưa có hoạt động nào.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-[#5c4033]/60">
                        <th className="py-2 px-2 text-[#f4d03f]">Thời gian</th>
                        <th className="py-2 px-2 text-[#f4d03f]">Hành động</th>
                        <th className="py-2 px-2 text-[#f4d03f]">Wallet</th>
                        <th className="py-2 px-2 text-[#f4d03f]">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((item) => (
                        <tr key={item.id} className="border-b border-[#5c4033]/40">
                          <td className="py-2 px-2 text-[#e8e0d0]/85 whitespace-nowrap">
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td className="py-2 px-2 text-[#f4d03f] whitespace-nowrap">
                            {ACTION_LABELS[item.action] || item.action}
                          </td>
                          <td className="py-2 px-2 text-[#e8e0d0]/85 font-mono whitespace-nowrap">
                            {item.walletAddress
                              ? `${item.walletAddress.slice(0, 8)}...${item.walletAddress.slice(-4)}`
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-[#e8e0d0]/85 max-w-[260px]">
                            <pre className="whitespace-pre-wrap break-all text-[11px] bg-black/20 rounded-md p-2 border border-[#5c4033]/60">
                              {JSON.stringify(item.meta ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activityTotalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                      disabled={activityPage <= 1 || activityLoading}
                      className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 text-[#e8e0d0] hover:bg-[#5c4033]/40 disabled:opacity-50"
                    >
                      Trước
                    </button>
                    <span className="text-xs text-[#e8e0d0]/80">
                      Trang {activityPage} / {activityTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                      disabled={activityPage >= activityTotalPages || activityLoading}
                      className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 text-[#e8e0d0] hover:bg-[#5c4033]/40 disabled:opacity-50"
                    >
                      Sau
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function AdminUsers() {
  return <AdminUsersContent />
}

export function AdminUsersEmbedded() {
  return <AdminUsersContent embedded />
}
