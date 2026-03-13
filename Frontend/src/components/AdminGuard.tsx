import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { apiFetch, getAuthToken } from '../api/http'

type UserRole = 'USER' | 'STAFF' | 'OWNER'

interface MeResponse {
  ok?: boolean
  user?: { role?: UserRole }
}

/**
 * Chỉ cho phép STAFF và OWNER vào trang admin.
 * User thường sẽ bị redirect về trang chủ.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading')

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setStatus('denied')
      return
    }

    let cancelled = false

    apiFetch<MeResponse>('/me', { method: 'GET' })
      .then((json) => {
        if (cancelled) return
        const role = json?.user?.role
        if (role === 'STAFF' || role === 'OWNER') {
          setStatus('allowed')
        } else {
          setStatus('denied')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('denied')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d2817] via-[#5c4033] to-[#1e3a5f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#f4d03f]/30 border-t-[#f4d03f] animate-spin" />
          <div className="text-sm text-[#f5f1e8]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Đang kiểm tra quyền...
          </div>
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
