import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance } from 'wagmi'
import { formatEther } from 'viem'
import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, getAuthToken } from '../api/http'
import { EventSearchItem, searchEvents } from '../api/events'
import {
  BellNotification,
  connectBellStream,
  listBellNotifications,
  markAllBellAsRead,
  markBellAsRead,
} from '../api/bell'

export default function Header() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address: address,
    query: {
      enabled: !!address && isConnected,
    },
  })

  // Format balance để hiển thị
  const formatBalance = () => {
    if (!isConnected || !address) return '$0.00'
    if (balanceLoading) return 'Loading...'
    if (!balance) return '$0.00'
    
    const ethBalance = parseFloat(formatEther(balance.value))
    return `$${ethBalance.toFixed(4)}`
  }

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-140 overflow-visible flex h-16 items-center bg-[#3d2817]/90 backdrop-blur-md border-b border-[#5c4033]/50 px-3 sm:px-10 lg:h-20 lg:px-20 shadow-lg"
      style={{ fontFamily: "'Lora', serif" }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 sm:gap-4 md:gap-6 lg:gap-8">
        {/* Left Section - Logo + Search */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-6">
          <Logo />
          <SearchBar />
        </div>

        {/* Center Section - Empty Space */}
        <div className="flex-1"></div>

        {/* Right Actions Section */}
        <RightActions
          isConnected={isConnected}
          balance={formatBalance()}
          onProfileClick={() => navigate('/profile')}
          onAdminClick={() => navigate('/admin')}
        />
      </div>
    </nav>
  )
}

// Logo Component
function Logo() {
  return (
    <div className="flex shrink-0 items-center">
      <a
        href="/"
        className="flex items-center gap-1.5 sm:gap-2 md:gap-3 transition-opacity duration-200 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#f4d03f]/50 focus:ring-offset-2 focus:ring-offset-[#3d2817] rounded-lg"
        aria-label="Zeo - Trang chủ"
      >
        {/* Ticket Icon */}
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-[#d4af37] to-[#f4d03f] shadow-lg transition-transform duration-200 hover:scale-105 sm:h-9 sm:w-9 md:h-10 md:w-10">
          <svg
            className="h-4 w-4 text-[#3d2817] sm:h-5 sm:w-5 md:h-6 md:w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Ticket icon"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 1 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 1 0 0-6V7a2 2 0 0 0-2-2H5z"
            />
          </svg>
        </div>
        {/* Logo Text */}
        <span 
          className="text-base font-bold bg-linear-to-r from-[#f4d03f] via-[#d4af37] to-[#d97706] bg-clip-text text-transparent sm:text-lg md:text-xl drop-shadow-md" 
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Zeo
        </span>
      </a>
    </div>
  )
}

// Search Bar Component
function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventSearchItem[]>([])
  const [open, setOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [dropdownRect, setDropdownRect] = useState({ left: 0, top: 0, width: 0 })

  const updateDropdownRect = useCallback(() => {
    const node = rootRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setDropdownRect({
      left: Math.max(8, rect.left),
      top: rect.bottom + 8,
      width: rect.width,
    })
  }, [])

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    const keyword = query.trim()
    if (!keyword) {
      setResults([])
      setIsSearching(false)
      setSearchError('')
      return
    }

    let cancelled = false
    setIsSearching(true)
    setSearchError('')
    setOpen(true)
    const t = window.setTimeout(() => {
      void searchEvents(keyword, 8)
        .then((rows) => {
          if (!cancelled) {
            const byContract = new Map<string, EventSearchItem>()
            for (const item of rows) {
              const key = `${item.chainId ?? ''}:${(item.contractAddress || '').toLowerCase() || item.id}`
              if (!byContract.has(key)) {
                byContract.set(key, item)
              }
            }
            setResults(Array.from(byContract.values()))
            setOpen(true)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([])
            setSearchError('Không thể tải dữ liệu tìm kiếm.')
            setOpen(true)
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false)
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query])

  useEffect(() => {
    if (!open) return
    updateDropdownRect()
    const onResize = () => updateDropdownRect()
    const onScroll = () => updateDropdownRect()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updateDropdownRect])

  const goToEvent = useCallback(
    (item: EventSearchItem) => {
      if (!item?.name) return
      setOpen(false)
      setQuery('')
      navigate(`/event/${encodeURIComponent(item.name)}`, {
        state: {
          id: item.id,
          name: item.name,
          title: item.title,
          chainId: item.chainId,
          tokenId: item.tokenId,
          contractAddress: item.contractAddress,
        },
      })
    },
    [navigate],
  )

  return (
    <div ref={rootRef} className="relative w-auto min-w-[100px] sm:min-w-[160px] md:min-w-[200px] lg:min-w-[400px] max-w-[150px] sm:max-w-[220px] md:max-w-[280px] lg:max-w-[360px]">
      <div className="group relative flex h-9 w-full items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#5c4033]/50 bg-[#3d2817]/60 backdrop-blur-md px-2 shadow-sm transition-all duration-150 hover:bg-[#5c4033]/60 hover:border-[#d4af37]/50 focus-within:bg-[#5c4033]/60 focus-within:border-[#d4af37]/50 sm:h-10 sm:gap-2 sm:px-3">
        {/* Search Icon */}
        <div className="flex min-w-fit items-center">
          <svg
            aria-label="Search"
            className="h-4 w-4 text-[#f4d03f] sm:h-[18px] sm:w-[18px]"
            fill="currentColor"
            role="img"
            viewBox="0 0 24 24"
          >
            <path d="m21 20-5.2-5.2a7 7 0 1 0-1.4 1.4L20 21zM5 10a5 5 0 1 1 10 0 5 5 0 0 1-10 0" />
          </svg>
        </div>
        
        {/* Search Input */}
        <input
          type="search"
          aria-label="Search for tickets"
          aria-invalid="false"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            updateDropdownRect()
            if (query.trim()) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault()
              goToEvent(results[0])
            }
          }}
          placeholder="Bạn Muốn Tìm Vé Gì?"
          className="w-full border-0 bg-transparent text-xs text-[#e8e0d0] outline-none placeholder:text-[#f4d03f]/60 focus:placeholder:text-[#f4d03f]/40 sm:text-sm"
        />
        
        {/* Keyboard Shortcut */}
        <div className="hidden min-w-fit items-center sm:flex">
          <div className="flex size-5 items-center justify-center rounded border border-[#5c4033]/50 bg-[#3d2817]/40 text-[#f4d03f]/60 sm:size-6">
            <span className="text-xs leading-none">/</span>
          </div>
        </div>
      </div>

      {open && (
        <div
          className="fixed rounded-xl border border-[#d4af37]/30 bg-[#2a1a11]/95 backdrop-blur-md shadow-xl overflow-hidden"
          style={{
            left: dropdownRect.left,
            top: dropdownRect.top,
            width: dropdownRect.width,
            zIndex: 9999,
          }}
        >
          {isSearching && (
            <div className="px-3 py-2 text-xs text-[#e8e0d0]/80">Đang tìm sự kiện...</div>
          )}
          {!isSearching && !!searchError && (
            <div className="px-3 py-2 text-xs text-rose-300/90">{searchError}</div>
          )}
          {!isSearching && !searchError && results.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-[#e8e0d0]/80">Không tìm thấy sự kiện phù hợp.</div>
          )}
          {!isSearching &&
            results.map((item) => (
              <button
                key={`${item.id}-${item.name}`}
                type="button"
                onClick={() => goToEvent(item)}
                className="w-full border-b border-[#5c4033]/45 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-[#5c4033]/35"
              >
                <div className="text-sm font-semibold text-[#f5f1e8] line-clamp-1">{item.title || item.name}</div>
                <div className="mt-0.5 text-[11px] text-[#e8e0d0]/80 line-clamp-1">
                  {[item.location, item.date].filter(Boolean).join(' • ') || item.contractAddress}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// Notification Button Component
interface NotificationButtonProps {
  unreadCount: number
  onToggle: () => void
}

function formatBellTime(value: string | null | undefined) {
  if (!value || typeof value !== 'string') return 'Vua xong'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return 'Vua xong'
  return new Date(ts).toLocaleString('vi-VN')
}

function NotificationButton({
  unreadCount,
  onToggle,
}: NotificationButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#e8e0d0] transition-all duration-200 hover:bg-[#5c4033]/60 hover:text-[#f4d03f] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#f4d03f]/50 focus:ring-offset-2 focus:ring-offset-[#3d2817] sm:h-9 sm:w-9 md:h-10 md:w-10 md:px-3"
      aria-label="Notifications"
    >
      <svg
        className="h-4 w-4 sm:h-5 sm:w-5"
        fill="currentColor"
        role="img"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2m6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#ef4444] text-white text-[10px] leading-4 text-center font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}

// Balance Button Component
interface BalanceButtonProps {
  balance: string
}

function BalanceButton({ balance }: BalanceButtonProps) {
  return (
    <button
      type="button"
      className="hidden items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[#e8e0d0] transition-all duration-200 hover:bg-[#5c4033]/60 hover:text-[#f4d03f] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#f4d03f]/50 focus:ring-offset-2 focus:ring-offset-[#3d2817] sm:inline-flex sm:h-9 sm:px-3 sm:text-sm md:h-10 md:gap-3 md:px-4"
      aria-label={`Current balance: ${balance}`}
    >
      <svg
        className="h-4 w-4 text-[#f4d03f] sm:h-5 sm:w-5"
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
      >
        <path d="M20 6H4a2 2 0 0 0-2 2v1h20V8a2 2 0 0 0-2-2M2 11h20v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Zm7 4a1 1 0 0 0 1 1h4a1 1 0 1 0 0-2h-4a1 1 0 0 0-1 1" />
      </svg>
      <span className="hidden font-mono text-[#f4d03f] md:inline" aria-label={`Balance: ${balance}`}>
        {balance}
      </span>
    </button>
  )
}

// Wallet Button Component
function WalletButton() {
  return (
    <div className="flex h-8 items-center sm:h-9 md:h-10 rainbowkit-no-scrollbar">
      <ConnectButton chainStatus="none" showBalance={false} />
    </div>
  )
}

// User Profile Button Component
interface UserProfileButtonProps {
  onClick: () => void
}

const UserProfileButton = ({ onClick }: UserProfileButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#e8e0d0] transition-all duration-200 hover:bg-[#5c4033]/60 hover:text-[#f4d03f] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#f4d03f]/50 focus:ring-offset-2 focus:ring-offset-[#3d2817] sm:h-9 sm:w-9 md:h-10 md:w-10"
      aria-label="User profile"
    >
      <svg
        className="h-4 w-4 sm:h-5 sm:w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    </button>
  )
}

// Right Actions Component
interface RightActionsProps {
  isConnected: boolean
  balance: string
  onProfileClick: () => void
  onAdminClick: () => void
}

function RightActions({ isConnected, balance, onProfileClick, onAdminClick }: RightActionsProps) {
  const [userRole, setUserRole] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<BellNotification[]>([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement | null>(null)

  const refreshUserRole = useCallback(() => {
    try {
      const raw = localStorage.getItem('auth_user')
      if (!raw) {
        setUserRole(null)
        return
      }
      const user = JSON.parse(raw) as { role?: string }
      setUserRole(user?.role ?? null)
    } catch {
      setUserRole(null)
    }
  }, [])

  useEffect(() => {
    if (!isConnected) {
      setUserRole(null)
      return
    }

    refreshUserRole()
    const onAuthChange = () => refreshUserRole()
    window.addEventListener('auth_token_changed', onAuthChange)

    // Hard check role from backend so admin icon only appears for STAFF/OWNER.
    apiFetch<{ user?: { role?: string } }>('/me', { method: 'GET' })
      .then((json) => {
        const role = json?.user?.role
        setUserRole(role === 'STAFF' || role === 'OWNER' ? role : null)
      })
      .catch(() => setUserRole(null))

    return () => window.removeEventListener('auth_token_changed', onAuthChange)
  }, [isConnected, refreshUserRole])

  useEffect(() => {
    let cancelled = false
    async function loadBell() {
      if (!isConnected || !getAuthToken()) {
        if (!cancelled) setNotifications([])
        return
      }
      try {
        const rows = await listBellNotifications()
        if (!cancelled) setNotifications(rows)
      } catch {
        if (!cancelled) setNotifications([])
      }
    }
    void loadBell()
    return () => {
      cancelled = true
    }
  }, [isConnected])

  useEffect(() => {
    if (!isConnected || !getAuthToken()) return
    const es = connectBellStream((next) => {
      setNotifications((prev) => [next, ...prev.filter((x) => x.id !== next.id)])
    })
    return () => {
      es?.close()
    }
  }, [isConnected])

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!notificationOpen) return
      const target = ev.target as Node
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setNotificationOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [notificationOpen])

  const canAccessAdmin = userRole === 'STAFF' || userRole === 'OWNER'
  const unreadCount = notifications.filter((x) => !x.readAt).length
  const topNotifications = notifications.slice(0, 8)

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
      {/* Admin icon: chỉ hiện với STAFF và OWNER */}
      {isConnected && canAccessAdmin && (
        <>
          <button
            type="button"
            onClick={onAdminClick}
            className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-xs font-medium text-[#e8e0d0] transition-all hover:bg-[#5c4033]/60 hover:text-[#f4d03f] sm:h-9 sm:px-3"
            aria-label="Admin Panel"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
            </svg>
            <span className="hidden sm:inline ml-1">Admin</span>
          </button>
          <Divider />
        </>
      )}

      {/* Notifications Button */}
      <div ref={notificationRef} className="relative">
        <NotificationButton
          unreadCount={unreadCount}
          onToggle={() => {
            setNotificationOpen((v) => {
              const next = !v
              if (next && unreadCount > 0) {
                // Optimistic: mark all read so badge disappears immediately.
                setNotifications((prev) =>
                  prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })),
                )
                void markAllBellAsRead().catch(() => {
                  // ignore; UI already updated
                })
              }
              return next
            })
          }}
        />

        {notificationOpen && (
          <div className="fixed right-3 sm:right-6 top-20 w-[340px] max-w-[calc(100vw-24px)] rounded-xl border border-[#d4af37]/40 bg-[#2a1a11]/97 backdrop-blur-lg shadow-2xl z-120">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#5c4033]/60">
              <div className="text-sm font-semibold text-[#f5f1e8]">Thông báo</div>
              {notifications.length > 0 && (<></>
                // <button
                //   type="button"
                //   onClick={() => {
                //     setNotifications((prev) =>
                //       prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })),
                //     )
                //     void markAllBellAsRead()
                //   }}
                //   className="text-[11px] px-2 py-1 rounded-md border border-[#5c4033]/70 text-[#e8e0d0] hover:border-[#d4af37]/60 hover:text-[#f4d03f]"
                // >
                //   {/* Đánh dấu đã đọc */}
                // </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2 space-y-2">
              {topNotifications.length === 0 ? (
                <div className="text-sm text-[#e8e0d0]/80 p-3 text-center">Chưa có thông báo nào.</div>
              ) : (
                topNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setNotifications((prev) =>
                        prev.map((x) => (x.id === item.id && !x.readAt ? { ...x, readAt: new Date().toISOString() } : x)),
                      )
                      void markBellAsRead(item.id)
                    }}
                    className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                      item.readAt
                        ? 'border-[#5c4033]/60 bg-[#3d2817]/25'
                        : 'border-[#d4af37]/45 bg-[#d4af37]/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[#f5f1e8] line-clamp-1">{item.title}</div>
                      <div className="text-[10px] text-[#e8e0d0]/70 shrink-0">
                        {formatBellTime(item.createdAt)}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-[#e8e0d0]/85 leading-relaxed">
                      {item.message}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <Divider />

      {/* Balance Button - Only show when connected */}
      {isConnected && (
        <>
          <BalanceButton balance={balance} />
          <Divider />
        </>
      )}

      {/* User Profile Button or Connect Wallet Button */}
      {isConnected ? (
        <UserProfileButton onClick={onProfileClick} />
      ) : (
        <WalletButton />
      )}

    </div>
  )
}

// Divider Component
function Divider() {
  return (
    <div 
      className="hidden h-3 w-px shrink-0 bg-[#5c4033]/50 sm:block md:h-6" 
      aria-hidden="true"
    />
  )
}
