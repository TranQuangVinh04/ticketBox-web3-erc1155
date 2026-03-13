import { apiFetch } from './http'

export type UserRole = 'USER' | 'STAFF' | 'OWNER'

export type AdminUserItem = {
  id: string
  walletAddress: string
  name: string
  role: UserRole
  lastLoginAt: string | null
  createdAt: string
  totalTickets: number
}

export type ListUsersResponse = {
  ok: boolean
  users: AdminUserItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function listUsers(params?: { q?: string; page?: number; limit?: number }) {
  const sp = new URLSearchParams()
  if (params?.q?.trim()) sp.set('q', params.q.trim())
  if (params?.page != null) sp.set('page', String(params.page))
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const query = sp.toString()
  return apiFetch<ListUsersResponse>(`/admin/users${query ? `?${query}` : ''}`, { method: 'GET' })
}

export async function updateUserRole(userId: string, role: UserRole) {
  return apiFetch<{ ok: boolean; user: Partial<AdminUserItem> }>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: { role },
  })
}
