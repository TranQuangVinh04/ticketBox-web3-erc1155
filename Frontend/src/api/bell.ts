import { apiFetch, getAuthToken, resolveBackendUrl } from './http'

export type BellNotification = {
  id: string
  kind: string
  title: string
  message: string
  createdAt: string
  readAt?: string | null
}

export async function listBellNotifications() {
  const res = await apiFetch<{ ok: boolean; notifications: BellNotification[] }>('/bell', { method: 'GET' })
  return Array.isArray(res.notifications) ? res.notifications : []
}

export async function markBellAsRead(id: string) {
  await apiFetch('/bell/' + encodeURIComponent(id) + '/read', { method: 'POST' })
}

export async function markAllBellAsRead() {
  await apiFetch('/bell/read-all', { method: 'POST' })
}

export function connectBellStream(onBell: (n: BellNotification) => void, onOpen?: () => void, onError?: () => void) {
  const token = getAuthToken()
  if (!token) return null
  const base = resolveBackendUrl()
  const url = `${base}/bell/stream?token=${encodeURIComponent(token)}`
  const es = new EventSource(url)
  es.addEventListener('ready', () => onOpen?.())
  es.addEventListener('bell', (ev) => {
    try {
      const parsed = JSON.parse((ev as MessageEvent).data) as BellNotification
      if (parsed && typeof parsed.id === 'string') onBell(parsed)
    } catch {
      // ignore bad packet
    }
  })
  es.onerror = () => onError?.()
  return es
}
