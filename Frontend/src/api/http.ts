import axios, { AxiosHeaders, type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'

const DEFAULT_BACKEND_URL = '/api'

function trimTrailingSlash(url: string) {
  return url.replace(/\/$/, '')
}

/**
 * Resolve backend base URL.
 *
 * Priority:
 * - query param: ?backendUrl=... or ?backend_url=...
 * - env: VITE_BACKEND_URL
 * - localStorage: backend_url / backendUrl / VITE_BACKEND_URL
 * - default: /api (works with Vite proxy)
 */
export function resolveBackendUrl() {
  const env = import.meta.env.VITE_BACKEND_URL as string | undefined

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
  return trimTrailingSlash(base)
}

export function getAuthToken() {
  try {
    return localStorage.getItem('auth_token') || ''
  } catch {
    return ''
  }
}

function normalizeHeaders(input?: AxiosRequestConfig['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  if (!input) return out

  // Axios accepts plain object; we only normalize string values.
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function isAxiosError(e: unknown): e is AxiosError {
  return typeof e === 'object' && e !== null && 'isAxiosError' in e
}

let cachedClient: AxiosInstance | null = null
let cachedBaseUrl: string | null = null

function getApiClient() {
  const baseURL = resolveBackendUrl()

  // Recreate instance if baseURL changes (query/localStorage/env can change at runtime).
  if (cachedClient && cachedBaseUrl === baseURL) return cachedClient

  const client = axios.create({
    baseURL,
    // We auth via Authorization: Bearer <jwt> header.
    // Keep cookies disabled to avoid CORS "credentials include" issues when backend uses Access-Control-Allow-Origin: *
    withCredentials: false,
  })

  client.interceptors.request.use((config) => {
    const headers = normalizeHeaders(config.headers)

    // Default accept JSON
    if (!('accept' in headers) && !('Accept' in headers)) headers.accept = 'application/json'

    // Attach JWT (Authorization: Bearer <token>)
    const skipAuth = (config as any).skipAuth === true
    if (!skipAuth && !('authorization' in headers) && !('Authorization' in headers)) {
      const token = getAuthToken()
      if (token) headers.authorization = `Bearer ${token}`
    }

    config.headers = AxiosHeaders.from(headers)
    return config
  })

  client.interceptors.response.use(
    (res) => res,
    (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 401) {
        try {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
        } catch {
          // ignore
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth_token_changed'))
        }
      }
      return Promise.reject(error)
    },
  )

  cachedClient = client
  cachedBaseUrl = baseURL
  return client
}

export async function apiFetch<T = unknown>(
  path: string,
  init:
    | (Omit<RequestInit, 'body'> & {
        /** Axios `data` payload (can be object for JSON). */
        body?: unknown
        skipAuth?: boolean
      })
    | undefined = {},
): Promise<T> {
  const config: AxiosRequestConfig & { skipAuth?: boolean } = {
    url: path,
    method: (init?.method as any) || 'GET',
    headers: init?.headers as any,
    data: (init as any)?.body,
    skipAuth: init?.skipAuth,
  }

  try {
    const res = await getApiClient().request<T>(config)
    return res.data
  } catch (e) {
    if (isAxiosError(e)) {
      const status = e.response?.status
      const data = e.response?.data as any
      const message = data?.message || data?.error || e.message || `Request failed (${status ?? 'unknown'})`
      throw new Error(String(message))
    }
    throw e
  }
}

