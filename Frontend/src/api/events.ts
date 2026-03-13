import { apiFetch } from './http'

// GET /api/getAllEvent
export async function getAllEvent() {
  return apiFetch<unknown>('/getAllEvent', { method: 'GET' })
}

export async function getAllEventAdmin() {
  return apiFetch<unknown>('/admin/getAllEvent', { method: 'GET' })
}

export type EventSearchItem = {
  id: string
  name: string
  title: string
  bannerImage?: string
  date?: string
  location?: string
  chainId?: number
  tokenId?: string
  contractAddress?: string
}

export async function searchEvents(query: string, limit = 8) {
  const q = query.trim()
  if (!q) return [] as EventSearchItem[]
  const params = new URLSearchParams({ q, limit: String(limit) })
  const res = await apiFetch<{ ok?: boolean; results?: EventSearchItem[] }>(`/events/search?${params.toString()}`, {
    method: 'GET',
  })
  return Array.isArray(res?.results) ? res.results : []
}

export type UpsertEventDisplayPayload = {
  slug: string
  title: string
  description?: string
  bannerImage?: string
  date?: string
  location?: string
  displayPrice?: string
  featured?: boolean
  bannerHighlight?: boolean
  highlightOrder?: number
  chainId: number
  contractAddress: string
  defaultTokenId?: string
  deleted?: boolean
}

export async function upsertEventDisplay(payload: UpsertEventDisplayPayload) {
  return apiFetch('/admin/event-display', {
    method: 'PUT',
    body: payload,
  })
}

export async function deleteEventDisplay(payload: { slug: string; chainId: number; contractAddress: string }) {
  return apiFetch('/admin/event-display/delete', {
    method: 'POST',
    body: payload,
  })
}

export async function restoreEventDisplay(payload: { slug: string; chainId: number; contractAddress: string }) {
  return apiFetch('/admin/event-display/restore', {
    method: 'POST',
    body: payload,
  })
}

