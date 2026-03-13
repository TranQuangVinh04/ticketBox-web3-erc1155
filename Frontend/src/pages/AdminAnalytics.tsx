import { useEffect, useState, useRef, Fragment, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import Header from '../components/Header'
import { getAnalyticsOverview, type AnalyticsOverview } from '../api/analytics'

function shortAddress(addr: string | null | undefined) {
  if (!addr) return ''
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`
}

function AdminAnalyticsContent({ embedded }: { embedded?: boolean }) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const location = useLocation()
  const highlightEventId = (location.state as any)?.highlightEventId as string | undefined
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null)

  const groupedEvents = useMemo(() => {
    if (!overview) return []
    const map = new Map<
      string,
      {
        key: string
        contractAddress: string | null
        chainId: number
        label: string
        events: AnalyticsOverview['events']
        totalRevenueEth: number
        totalSold: number
        totalRemaining: number
      }
    >()

    for (const ev of overview.events) {
      const addr = (ev.contractAddress || '').toLowerCase()
      const key = `${ev.chainId}:${addr || 'no-contract'}`
      const existing = map.get(key)
      const label = (ev.name || ev.eventId) as string
      const rev = ev.revenueEth != null ? Number(ev.revenueEth) : 0
      const sold = ev.ticketsSold
      const remainingForWallets = ev.ticketsSold > ev.checkins ? ev.ticketsSold - ev.checkins : 0
      if (!existing) {
        map.set(key, {
          key,
          contractAddress: ev.contractAddress,
          chainId: ev.chainId,
          label,
          events: [ev],
          totalRevenueEth: rev,
          totalSold: sold,
          totalRemaining: remainingForWallets,
        })
      } else {
        existing.events.push(ev)
        if (!existing.label && label) existing.label = label
        existing.totalRevenueEth += rev
        existing.totalSold += sold
        existing.totalRemaining += remainingForWallets
      }
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [overview])

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

  useEffect(() => {
    if (highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [overview, highlightEventId])

  return (
    <div
      className={embedded ? '' : 'min-h-screen bg-linear-to-b from-[#1e3a5f]/60 via-[#3d2817]/60 to-[#1e3a5f]/60'}
      style={embedded ? undefined : { fontFamily: "'Lora', serif" }}
    >
      {!embedded && <Header />}

      <main
        className={
          embedded ? 'max-w-6xl mx-auto px-0 py-4' : 'max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10'
        }
      >
        {!embedded && (
          <div className="mb-6 rounded-2xl border border-[#5c4033]/50 bg-[#3d2817]/55 backdrop-blur-md p-4 sm:p-6 flex items-center justify-between">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold text-[#f4d03f]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Admin • Thống Kê
              </h1>
              <p className="mt-1 text-sm text-[#e8e0d0]/80">
                Tổng quan doanh thu vé + hoạt động quan trọng để bạn theo dõi hệ thống.
              </p>
            </div>
          </div>
        )}

        {/* Event stats */}
        <section className="mb-6 rounded-2xl border border-[#5c4033]/60 bg-[#3d2817]/60 backdrop-blur-md p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg sm:text-xl font-bold text-[#f5f1e8]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Thống kê theo sự kiện
            </h2>
          </div>
          {!overview || groupedEvents.length === 0 ? (
            <div className="text-sm text-[#e8e0d0]/80">Chưa có dữ liệu event nào.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#5c4033]/60">
                    <th className="py-2 px-2 text-[#f4d03f]">Sự kiện</th>
                    <th className="py-2 px-2 text-[#f4d03f]">Contract</th>
                    <th className="py-2 px-2 text-[#f4d03f]">TokenId</th>
                    <th className="py-2 px-2 text-[#f4d03f]">Vé đã bán</th>
                    <th className="py-2 px-2 text-[#f4d03f]">Đã check-in</th>
                    <th className="py-2 px-2 text-[#f4d03f] text-right">Doanh thu (ETH)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedEvents.map((group) => (
                    <Fragment key={group.key}>
                      <tr className="bg-black/25 border-b border-[#5c4033]/70">
                        <td colSpan={4} className="py-2 px-2 text-[#f5f1e8] font-semibold">
                          {group.label}
                          {group.contractAddress && (
                            <span className="ml-2 text-[11px] text-[#e8e0d0]/70">
                              • Contract: {shortAddress(group.contractAddress)}
                            </span>
                          )}
                        </td>
                        <td colSpan={2} className="py-2 px-2 text-[11px] text-[#f4d03f] font-semibold text-right">
                          Đã bán: {group.totalSold} vé • Tổng doanh thu: {group.totalRevenueEth.toFixed(4)} ETH
                        </td>
                      </tr>
                      {group.events.map((ev) => {
                        const isHighlight = highlightEventId && ev.eventId === highlightEventId
                        return (
                          <tr
                            key={`${group.key}-${ev.eventId}-${ev.tokenId}`}
                            ref={isHighlight ? highlightRowRef : undefined}
                            className={`border-b border-[#5c4033]/40 ${
                              isHighlight ? 'bg-black/40 ring-1 ring-[#f4d03f]/70' : ''
                            }`}
                          >
                            <td className="py-2 px-2 text-[#e8e0d0]">{ev.name || ev.eventId}</td>
                            <td className="py-2 px-2 text-[#e8e0d0]/85">
                              {ev.contractAddress ? shortAddress(ev.contractAddress) : '—'}
                            </td>
                            <td className="py-2 px-2 text-[#e8e0d0]/85">{ev.tokenId}</td>
                            <td className="py-2 px-2 text-[#f4d03f] font-semibold">{ev.ticketsSold}</td>
                            <td className="py-2 px-2 text-[#a7f3d0] font-semibold">{ev.checkins}</td>
                            <td className="py-2 px-2 text-[#f4d03f] font-semibold text-right">
                              {ev.revenueEth != null ? ev.revenueEth.toFixed(4) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}

export default function AdminAnalytics() {
  return <AdminAnalyticsContent />
}

export function AdminAnalyticsEmbedded() {
  return <AdminAnalyticsContent embedded />
}

