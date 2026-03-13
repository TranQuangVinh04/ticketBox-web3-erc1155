export type AppNotification = {
  id: string
  kind: 'checkin' | 'system'
  title: string
  message: string
  createdAt: string
  readAt?: string
}

const STORAGE_KEY = 'app_notifications_v1'
const CHANGE_EVENT = 'app_notifications_changed'

function safeParse(raw: string | null): AppNotification[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => x as AppNotification)
      .filter((x) => typeof x.id === 'string' && typeof x.title === 'string' && typeof x.message === 'string')
  } catch {
    return []
  }
}

function emitChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getNotifications(): AppNotification[] {
  const list = safeParse(localStorage.getItem(STORAGE_KEY))
  return list.sort((a, b) => {
    const ta = Date.parse(a.createdAt || '')
    const tb = Date.parse(b.createdAt || '')
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
}

export function upsertNotification(next: AppNotification) {
  const list = getNotifications()
  const idx = list.findIndex((x) => x.id === next.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...next }
  else list.unshift(next)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)))
  emitChanged()
}

export function markAllNotificationsAsRead() {
  const now = new Date().toISOString()
  const updated = getNotifications().map((x) => (x.readAt ? x : { ...x, readAt: now }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  emitChanged()
}

export function markNotificationAsRead(id: string) {
  const now = new Date().toISOString()
  const updated = getNotifications().map((x) => (x.id === id && !x.readAt ? { ...x, readAt: now } : x))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  emitChanged()
}

export function getNotificationChangeEventName() {
  return CHANGE_EVENT
}
