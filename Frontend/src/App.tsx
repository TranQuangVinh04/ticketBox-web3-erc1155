import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { Navigate, Route, Routes } from 'react-router-dom'
import { config } from '../wagmi.config'
import '@rainbow-me/rainbowkit/styles.css'
import { useAccount, useDisconnect } from 'wagmi'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

const Home = lazy(() => import('./pages/Home'))
const Profile = lazy(() => import('./pages/Profile'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const CheckinScanner = lazy(() => import('./pages/CheckinScanner'))
const AdminEvents = lazy(() => import('./pages/AdminEvents'))
const AdminHub = lazy(() => import('./pages/AdminHub'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'))
import WalletSignIn from './components/WalletSignIn'
import AdminGuard from './components/AdminGuard'
import './App.css'

// Tạo QueryClient để quản lý cache và state
// Cấu hình để tránh lỗi JSON parsing
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function AuthGate() {
  const { address, isConnected, isReconnecting } = useAccount()
  const { disconnect } = useDisconnect()

  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('auth_token')
    } catch {
      return null
    }
  })

  const refreshToken = useCallback(() => {
    try {
      setToken(localStorage.getItem('auth_token'))
    } catch {
      setToken(null)
    }
  }, [])

  useEffect(() => {
    refreshToken()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token') refreshToken()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('auth_token_changed', refreshToken)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('auth_token_changed', refreshToken)
    }
  }, [refreshToken])

  // Chỉ xóa token khi user chủ động thoát ví, KHÔNG xóa khi:
  // - reload (wallet chưa kịp reconnect)
  // - isReconnecting (Edge/trình duyệt khác có thể reconnect chậm)
  // - grace period 3s: tránh xóa khi status flicker trong lúc reconnect
  const hasBeenConnectedRef = useRef(false)
  useEffect(() => {
    if (isConnected && address) {
      hasBeenConnectedRef.current = true
      return
    }
    if (isReconnecting) return
    if (!hasBeenConnectedRef.current) return

    const t = setTimeout(() => {
      setToken(null)
      try {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      } catch {
        // ignore
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [address, isConnected, isReconnecting])

  const mustSignIn = !!(isConnected && address && !token)
  if (!mustSignIn) return null

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
      {/* Backdrop blocks all interaction */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-[min(520px,calc(100vw-2rem))]">
        <div className="mb-3 text-center text-sm text-[#e8e0d0]" style={{ fontFamily: "'Lora', serif" }}>
          Bạn cần <span className="font-semibold text-[#f4d03f]">ký đăng nhập</span> để sử dụng các chức năng trong web.
        </div>

        <WalletSignIn variant="card" onSuccess={() => refreshToken()} />

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('auth_token')
                localStorage.removeItem('auth_user')
              } catch {
                // ignore
              }
              disconnect()
              refreshToken()
            }}
            className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-[#5c4033]/60 bg-[#3d2817]/60 text-[#e8e0d0] hover:bg-[#5c4033]/60 transition-colors"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Ngắt kết nối ví
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  useEffect(() => {
    // Cleanup old local-only admin drafts to ensure app uses shared DB source of truth.
    try {
      localStorage.removeItem('admin_events_v1')
    } catch {
      // ignore
    }
  }, [])

  return (
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AuthGate />
          <Suspense
            fallback={
              <div className="min-h-screen bg-gradient-to-b from-[#3d2817] via-[#5c4033] to-[#1e3a5f] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-4 border-[#f4d03f]/30 border-t-[#f4d03f] animate-spin" />
                  <div className="text-sm sm:text-base text-[#f5f1e8] font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Đang tải...
                  </div>
                </div>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/event/:id" element={<EventDetail />} />
              <Route path="/admin" element={<AdminGuard><AdminHub /></AdminGuard>} />
              <Route path="/admin/events" element={<AdminGuard><AdminEvents /></AdminGuard>} />
              <Route path="/admin/checkin" element={<AdminGuard><CheckinScanner /></AdminGuard>} />
              <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
              <Route path="/admin/analytics" element={<AdminGuard><AdminAnalytics /></AdminGuard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
