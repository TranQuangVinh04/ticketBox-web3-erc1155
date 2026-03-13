import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId, useSignMessage } from 'wagmi'
type SignInState =
  | { status: 'idle' }
  | { status: 'signing' }
  | { status: 'success'; address: string; token?: string }
  | { status: 'error'; message: string }

// Default to same-origin so Vite proxy (/api -> http://localhost:4000) can avoid CORS in dev.
const DEFAULT_BACKEND_URL = '/api'

function makeNonce() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildFallbackMessage(params: { address: string; chainId: number; nonce: string }) {
  const issuedAt = new Date().toISOString()
  return [
    'Zeo wants you to sign in with your Ethereum account:',
    params.address,
    '',
    'Sign in to Zeo.',
    '',
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

async function safeReadJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function setAuthTokenCookie(token: string) {
  // Note: cookie set from JS cannot be HttpOnly.
  // Use SameSite=Lax to reduce CSRF risk; Secure only when https (avoid breaking localhost http).
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`
}

export default function WalletSignIn({
  variant = 'card',
  onSuccess,
}: {
  variant?: 'card' | 'headless'
  onSuccess?: (token?: string) => void
}) {
  const { address, isConnected, chainId: chainIdFromAccount } = useAccount()
  const chainId = chainIdFromAccount ?? 11155111
  const { signMessageAsync } = useSignMessage()

  const backendUrl = useMemo(() => {
    const env = import.meta.env.VITE_BACKEND_URL as string | undefined

    // Runtime overrides for easier testing (no restart needed):
    // - URL query: ?backendUrl=http://localhost:4000/api
    // - localStorage: backend_url / backendUrl / VITE_BACKEND_URL
    let queryOverride: string | undefined
    let storageOverride: string | undefined

    if (typeof window !== 'undefined') {
      try {
        const sp = new URLSearchParams(window.location.search)
        queryOverride = sp.get('backendUrl') || sp.get('backend_url') || undefined
      } catch {
        // ignore
      }

      try {
        storageOverride =
          localStorage.getItem('backend_url') ||
          localStorage.getItem('backendUrl') ||
          localStorage.getItem('VITE_BACKEND_URL') ||
          undefined
      } catch {
        // ignore
      }
    }

    const base = (queryOverride || env || storageOverride || DEFAULT_BACKEND_URL).trim()
    return base.replace(/\/$/, '')
  }, [])

  const [state, setState] = useState<SignInState>({ status: 'idle' })
  const [debug, setDebug] = useState<{ message?: string; signature?: string }>({})

  const log = useCallback(
    (...args: unknown[]) => {
      if (variant !== 'headless') return
      console.log('[WalletSignIn]', ...args)
    },
    [variant],
  )

  const signIn = useCallback(async () => {
    if (!isConnected || !address) return

    setState({ status: 'signing' })
    setDebug({})

    try {
      // 1) Try to get nonce/message from backend. If backend is down, fall back to a local message
      // so the wallet popup still appears.
      let nonce: string
      let message: string
      try {
        const nonceRes = await fetch(
          `${backendUrl}/auth/wallet/nonce?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(
            String(chainId),
          )}`,
          { method: 'GET' },
        )
        const nonceJson = await safeReadJson(nonceRes)
        if (!nonceRes.ok) {
          const msg =
            (nonceJson && (nonceJson.message || nonceJson.error)) || `Nonce request failed (${nonceRes.status})`
          throw new Error(msg)
        }

        nonce = (nonceJson && (nonceJson.nonce as string | undefined)) || makeNonce()
        message =
          (nonceJson && (nonceJson.message as string | undefined)) || buildFallbackMessage({ address, chainId, nonce })
      } catch (e) {
        nonce = makeNonce()
        message = buildFallbackMessage({ address, chainId, nonce })
        const msg = e instanceof Error ? e.message : String(e)
        log('Nonce endpoint failed, using fallback message:', msg)
      }

      // 2) Wallet signs message
      // Small delay helps some connectors finish setup right after connect.
      await new Promise((r) => setTimeout(r, 150))
      const signature = await signMessageAsync({ message })
      setDebug({ message, signature })

      // 3) Verify signature + upsert user in backend
      try {
        const verifyRes = await fetch(`${backendUrl}/auth/wallet/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, chainId, message, signature }),
        })

        const verifyJson = await safeReadJson(verifyRes)
        if (!verifyRes.ok) {
          const msg =
            (verifyJson && (verifyJson.message || verifyJson.error)) || `Verify request failed (${verifyRes.status})`
          throw new Error(msg)
        }
        console.log('verifyJson', verifyJson)
        const token = verifyJson?.token as string | undefined
        const user = verifyJson?.user as { role?: string } | undefined
        if (token) {
          setAuthTokenCookie(token)
          localStorage.setItem('auth_token', token)
        }
        if (user && typeof window !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(user))
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth_token_changed'))
        }
        onSuccess?.(token)

        setState({ status: 'success', address, token })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log('Verify failed (backend likely down):', msg)
        setState({ status: 'error', message: msg })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setState({ status: 'error', message: msg })
    }
  }, [address, backendUrl, chainId, isConnected, log, onSuccess, signMessageAsync])

  // Reset when disconnected so next connect will auto-trigger again.
  useEffect(() => {
    if (isConnected) return
    lastAutoAttemptKeyRef.current = null
    setState({ status: 'idle' })
    setDebug({})
  }, [isConnected])

  // Auto-trigger signing once per (address, chainId) when connected.
  // Note: wallet will STILL require user confirmation in the wallet UI.
  const lastAutoAttemptKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isConnected || !address) return
    if (state.status !== 'idle') return

    // If you already have a token, don't keep prompting.
    const existingToken = localStorage.getItem('auth_token')
    if (existingToken) {
      setState({ status: 'success', address, token: existingToken })
      return
    }

    const key = `${address}:${chainId}`
    if (lastAutoAttemptKeyRef.current === key) return
    lastAutoAttemptKeyRef.current = key

    void signIn()
  }, [address, chainId, isConnected, signIn, state.status])

  if (!isConnected || !address) return null
  // Note: even if variant is "headless", we may still render in an overlay wrapper (App.tsx).

  return (
    <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-[#5c4033]/50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-[#f4d03f] drop-shadow-md"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Đăng nhập bằng ví (ký message)
          </h2>
          
        </div>

        <button
          onClick={signIn}
          disabled={state.status === 'signing'}
          className="shrink-0 px-3 sm:px-4 py-2 bg-linear-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] rounded-lg text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {state.status === 'signing' ? 'Đang ký...' : state.status === 'error' ? 'Thử lại' : 'Ký & Đăng nhập'}
        </button>
      </div>

      {state.status === 'success' && (
        <div className="mt-3 text-xs sm:text-sm text-[#4ade80]">
          Đăng nhập thành công ({address.slice(0, 6)}...{address.slice(-4)})
          
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-3 text-xs sm:text-sm text-[#f87171]">
          Lỗi: {state.message}
          <div className="text-[#e8e0d0] mt-1">
            Backend URL: <code>{backendUrl}</code>. Có thể override bằng{' '}
            <code>?backendUrl=http://localhost:4000/api</code> hoặc localStorage key <code>backend_url</code>.
          </div>
        </div>
      )}

      {(debug.message || debug.signature) && (
        <div className="mt-4 text-xs sm:text-sm text-[#e8e0d0] space-y-2">
          {debug.message && (
            <div>
              <div className="text-[#f4d03f] font-semibold mb-1">Message đã ký</div>
              <pre className="whitespace-pre-wrap wrap-break-word bg-black/20 border border-[#5c4033]/50 rounded-lg p-3">
                Welcome to Zeo Web App
              </pre>
            </div>
          )}

          {debug.signature && (
            <div>
              <div className="text-[#f4d03f] font-semibold mb-1">Signature</div>
              <pre className="whitespace-pre-wrap wrap-break-word bg-black/20 border border-[#5c4033]/50 rounded-lg p-3">
                {debug.signature}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

