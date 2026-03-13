import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { AdminEventsEmbedded } from './AdminEvents'
import { AdminUsersEmbedded } from './AdminUsers'
import { AdminAnalyticsEmbedded } from './AdminAnalytics'
import { CheckinScannerEmbedded } from './CheckinScanner'
import { getAnalyticsOverview, type AnalyticsOverview } from '../api/analytics'

type AdminFeature = {
  id: 'events' | 'checkin' | 'analytics' | 'users'
  title: string
  desc: string
  status: 'ready' | 'soon'
}

export default function AdminHub() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<'dashboard' | 'events' | 'users' | 'analytics' | 'checkin'>(
    'dashboard',
  )
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const features: AdminFeature[] = [
    {
      id: 'events',
      title: 'Quản Lý Sự Kiện',
      desc: 'Sửa banner, mô tả, số loại vé, thứ tự highlight banner.',
      status: 'ready',
    },
    {
      id: 'checkin',
      title: 'Quét QR Check-in',
      desc: 'Quét QR, verify và cập nhật check-in cho người tham dự.',
      status: 'ready',
    },
    {
      id: 'analytics',
      title: 'Thống Kê',
      desc: 'Dashboard doanh thu, lượt bán, check-in theo sự kiện.',
      status: 'ready',
    },
    {
      id: 'users',
      title: 'Quản Lý Người Dùng',
      desc: 'Tìm người dùng, role và lịch sử mua vé.',
      status: 'ready',
    },
  ]

  useEffect(() => {
    let cancelled = false
    async function loadOverview() {
      setOverviewLoading(true)
      setOverviewError(null)
      try {
        const data = await getAnalyticsOverview()
        if (!cancelled) setOverview(data)
      } catch (e) {
        if (!cancelled) setOverviewError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setOverviewLoading(false)
      }
    }
    void loadOverview()
    return () => {
      cancelled = true
    }
  }, [])

  const dashboardEvents = useMemo(() => {
    if (!overview) return []
    const map = new Map<
      string,
      {
        key: string
        name: string
        ticketsSold: number
        checkins: number
        revenueEth: number | null
        sampleEventId: string
      }
    >()

    for (const ev of overview.events) {
      const contract = (ev.contractAddress || '').toLowerCase()
      const key = `${ev.chainId}:${contract || ev.eventId}`
      const current = map.get(key)
      const name = (ev.name || ev.eventId) as string
      const revenue = ev.revenueEth != null ? Number(ev.revenueEth) : null
      if (!current) {
        map.set(key, {
          key,
          name,
          ticketsSold: ev.ticketsSold,
          checkins: ev.checkins,
          revenueEth: revenue,
          sampleEventId: ev.eventId,
        })
      } else {
        current.ticketsSold += ev.ticketsSold
        current.checkins += ev.checkins
        if (revenue != null) {
          current.revenueEth = (current.revenueEth ?? 0) + revenue
        }
        if (!current.name && name) current.name = name
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [overview])

  return (
    <div className="min-h-screen bg-linear-to-b from-[#1e3a5f]/60 via-[#3d2817]/60 to-[#1e3a5f]/60" style={{ fontFamily: "'Lora', serif" }}>
      <Header />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8 flex items-start gap-4 sm:gap-6">
        {/* Sidebar trái – cùng tone màu với web, cố định chiều cao */}
        <aside className="w-52 sm:w-56 lg:w-60 rounded-2xl bg-[#3d2817]/85 border border-[#5c4033]/70 shadow-xl shadow-black/40 flex flex-col overflow-hidden sticky top-4 max-h-[calc(100vh-2rem)]">
          <div className="px-4 py-4 border-b border-[#5c4033]/70 bg-gradient-to-r from-[#f4d03f]/10 via-transparent to-transparent">
            <div className="text-xs uppercase tracking-[0.16em] text-[#e8e0d0]/70 mb-1">
              Admin Panel
            </div>
           
          </div>

          <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setActiveSection('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-xl border ${
                activeSection === 'dashboard'
                  ? 'bg-[#5c4033]/90 text-[#f4d03f] border-[#f4d03f]/70 shadow-inner shadow-black/40'
                  : 'bg-[#3d2817]/70 text-[#e8e0d0] border-[#5c4033]/70 hover:bg-[#5c4033]/80'
              }`}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-[#f4d03f]">
                📊
              </span>
              <span>Dashboard tổng quan</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('events')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl ${
                activeSection === 'events'
                  ? 'bg-[#5c4033]/90 text-[#f4d03f]'
                  : 'text-[#e8e0d0] hover:text-[#f4d03f] hover:bg-[#5c4033]/80'
              }`}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-[#f4d03f]">
                🎫
              </span>
              <span>Quản lý sự kiện</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('users')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl ${
                activeSection === 'users'
                  ? 'bg-[#5c4033]/90 text-[#f4d03f]'
                  : 'text-[#e8e0d0] hover:text-[#f4d03f] hover:bg-[#5c4033]/80'
              }`}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-[#f4d03f]">
                👥
              </span>
              <span>Quản Lý Người Dùng</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('analytics')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl ${
                activeSection === 'analytics'
                  ? 'bg-[#5c4033]/90 text-[#f4d03f]'
                  : 'text-[#e8e0d0] hover:text-[#f4d03f] hover:bg-[#5c4033]/80'
              }`}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-[#f4d03f]">
                📈
              </span>
              <span>Thống kê & doanh thu</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('checkin')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl ${
                activeSection === 'checkin'
                  ? 'bg-[#5c4033]/90 text-[#f4d03f]'
                  : 'text-[#e8e0d0] hover:text-[#f4d03f] hover:bg-[#5c4033]/80'
              }`}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-[#f4d03f]">
                📷
              </span>
              <span>Quét QR check-in</span>
            </button>
          </nav>

          
        </aside>

        {/* Nội dung phải – đổi theo menu bên trái, KHÔNG rời trang */}
        <section className="flex-1 space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold text-[#f5f1e8]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {activeSection === 'dashboard' && 'Tổng quan hệ thống'}
                {activeSection === 'events' && 'Quản lý sự kiện'}
                {activeSection === 'users' && 'Người dùng & role'}
                {activeSection === 'analytics' && 'Thống kê & doanh thu'}
                {activeSection === 'checkin' && 'Quét QR check-in'}
              </h1>
              
            </div>
          </div>

          {activeSection === 'dashboard' && (
            <>
              {/* Hàng KPI mô phỏng – dùng màu nâu/vàng */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-2xl bg-[#3d2817]/80 border border-[#5c4033]/80 p-4">
                  <div className="text-xs text-[#e8e0d0]/80 mb-1">Doanh thu ước tính</div>
                  <div className="text-2xl font-bold text-[#f4d03f]">
                    {overview?.overview.totalRevenueEth?.toFixed
                      ? overview.overview.totalRevenueEth.toFixed(4)
                      : '—'}{' '}
                    ETH
                  </div>
                  <div className="mt-1 text-[11px] text-[#e8e0d0]/70">
                    Lấy từ thống kê tất cả sự kiện.
                  </div>
                </div>
                <div className="rounded-2xl bg-[#3d2817]/80 border border-[#5c4033]/80 p-4">
                  <div className="text-xs text-[#e8e0d0]/80 mb-1">Tổng vé đã bán</div>
                  <div className="text-2xl font-bold text-[#f4d03f]">
                    {overview ? overview.overview.totalTicketsSold : '—'}
                  </div>
                  <div className="mt-1 text-[11px] text-[#e8e0d0]/70">Tính trên tất cả contract đã cấu hình.</div>
                </div>
                <div className="rounded-2xl bg-[#3d2817]/80 border border-[#5c4033]/80 p-4">
                  <div className="text-xs text-[#e8e0d0]/80 mb-1">Người dùng</div>
                  <div className="text-2xl font-bold text-[#f4d03f]">
                    {overview ? overview.overview.totalUsers : '—'}
                  </div>
                  <div className="mt-1 text-[11px] text-[#e8e0d0]/70">Quản lý chi tiết ở mục Người dùng.</div>
                </div>
                <div className="rounded-2xl bg-[#3d2817]/80 border border-[#5c4033]/80 p-4">
                  <div className="text-xs text-[#e8e0d0]/80 mb-1">Check‑in hôm nay</div>
                  <div className="text-2xl font-bold text-[#f4d03f]">
                    {overview ? overview.overview.totalCheckins : '—'}
                  </div>
                  <div className="mt-1 text-[11px] text-[#e8e0d0]/70">Xem lịch sử trong log hoạt động.</div>
                </div>
              </div>

              {overviewLoading && !overview && (
                <div className="text-xs sm:text-sm text-[#e8e0d0]/80 mt-2">Đang tải thống kê tổng quan...</div>
              )}
              {overviewError && (
                <div className="text-xs sm:text-sm text-[#fecaca] mt-2">
                  Không tải được thống kê: {overviewError}
                </div>
              )}

              {/* Bảng sự kiện cơ bản – gộp theo contract (1 contract = 1 sự kiện), chỉ tập trung vào số vé đã bán */}
              {dashboardEvents.length > 0 && (
                <div className="mt-4 rounded-2xl border border-[#5c4033]/70 bg-[#3d2817]/80 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2
                      className="text-sm sm:text-base font-semibold text-[#f5f1e8]"
                      style={{ fontFamily: "'Playfair Display', serif" }}
                    >
                      Sự kiện & doanh thu cơ bản
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveSection('analytics')}
                      className="text-[11px] px-3 py-1 rounded-lg border border-[#d4af37]/60 text-[#f4d03f] bg-[#3d2817]/60 hover:bg-[#5c4033]/80"
                    >
                      Xem chi tiết Thống kê
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] sm:text-xs">
                      <thead>
                        <tr className="border-b border-[#5c4033]/60 text-[#f4d03f]">
                          <th className="py-1.5 px-2">Sự kiện</th>
                          <th className="py-1.5 px-2">Vé đã bán</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardEvents.slice(0, 6).map((ev) => (
                          <tr
                            key={ev.key}
                            className="border-b border-[#5c4033]/40 hover:bg-[#5c4033]/50 cursor-pointer"
                            onClick={() => {
                              // Chuyển sang tab "Thống kê & doanh thu" ngay trong AdminHub,
                              // giữ nguyên route hiện tại, không điều hướng sang trang khác.
                              setActiveSection('analytics')
                            }}
                          >
                            <td className="py-1.5 px-2 text-[#e8e0d0]">
                              {ev.name}
                            </td>
                            <td className="py-1.5 px-2 text-[#f4d03f] font-semibold">{ev.ticketsSold}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {activeSection === 'events' && (
            <div className="rounded-2xl border border-[#5c4033]/70 bg-[#3d2817]/80 p-2 sm:p-3 md:p-4">
              <div className="rounded-2xl border border-[#5c4033]/70 overflow-hidden bg-black/25">
                <AdminEventsEmbedded />
              </div>
            </div>
          )}

          {activeSection === 'users' && (
            <div className="rounded-2xl border border-[#5c4033]/70 bg-[#3d2817]/80 p-2 sm:p-3 md:p-4">
              <div className="rounded-2xl border border-[#5c4033]/70 overflow-hidden bg-black/25">
                <AdminUsersEmbedded />
              </div>
            </div>
          )}

          {activeSection === 'analytics' && (
            <div className="rounded-2xl border border-[#5c4033]/70 bg-[#3d2817]/80 p-2 sm:p-3 md:p-4">
              <div className="rounded-2xl border border-[#5c4033]/70 overflow-hidden bg-black/25">
                <AdminAnalyticsEmbedded />
              </div>
            </div>
          )}

          {activeSection === 'checkin' && (
            <div className="rounded-2xl border border-[#5c4033]/70 bg-[#3d2817]/80 p-2 sm:p-3 md:p-4">
              <div className="rounded-2xl border border-[#5c4033]/70 overflow-hidden bg-black/25">
                <CheckinScannerEmbedded />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
