import { apiFetch } from './http'

export type AnalyticsOverview = {
  ok: boolean
  overview: {
    totalUsers: number
    totalTicketsSold: number
    totalEvents: number
    totalCheckins: number
    totalRevenueEth: number
  }
  events: {
    eventId: string
    name: string | null
    chainId: number
    tokenId: string
    contractAddress: string | null
    ticketsSold: number
    checkins: number
    priceEth: number | null
    revenueEth: number | null
  }[]
}

export async function getAnalyticsOverview() {
  return apiFetch<AnalyticsOverview>('/admin/analytics/overview', { method: 'GET' })
}

export type ActivityItem = {
  id: string
  userId: string | null
  walletAddress: string | null
  action: string
  meta: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export type ActivityResponse = {
  ok: boolean
  items: ActivityItem[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export async function listActivity(params?: { page?: number; limit?: number; action?: string; wallet?: string }) {
  const sp = new URLSearchParams()
  if (params?.page != null) sp.set('page', String(params.page))
  if (params?.limit != null) sp.set('limit', String(params.limit))
  if (params?.action && params.action.trim()) sp.set('action', params.action.trim())
   if (params?.wallet && params.wallet.trim()) sp.set('wallet', params.wallet.trim())
  const query = sp.toString()
  return apiFetch<ActivityResponse>(`/admin/activity${query ? `?${query}` : ''}`, { method: 'GET' })
}

