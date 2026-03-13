import { useCallback, useEffect, useState } from 'react'

type Options = {
  /** Auto-trigger reload when the tab/window regains focus */
  onFocus?: boolean
  /** Auto-trigger reload when auth token changes (we dispatch `auth_token_changed`) */
  onAuthTokenChanged?: boolean
}

/**
 * Small helper for "professional" reload UX:
 * - manual reload button (trigger)
 * - optional auto reload on focus / auth changes
 */
export function useReload(options: Options = {}) {
  const { onFocus = true, onAuthTokenChanged = true } = options
  const [reloadNonce, setReloadNonce] = useState(0)

  const triggerReload = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!onFocus) return
    const handler = () => triggerReload()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [onFocus, triggerReload])

  useEffect(() => {
    if (!onAuthTokenChanged) return
    const handler = () => triggerReload()
    window.addEventListener('auth_token_changed', handler as any)
    return () => window.removeEventListener('auth_token_changed', handler as any)
  }, [onAuthTokenChanged, triggerReload])

  return { reloadNonce, triggerReload }
}

