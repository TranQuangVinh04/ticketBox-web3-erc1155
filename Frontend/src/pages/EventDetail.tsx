import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import atraic2Image from '../public/atraic2.png'
import backgroundImage from '../public/background.jpg'
import { getAllEvent } from '../api/events'
import { useReadContract, useReadContracts } from 'wagmi'
import { ticket1155Abi } from '../abi/ticket1155Abi'
import { formatEther } from 'viem'
import { useReload } from '../hooks/useReload'

const BuyTicket = lazy(() => import('../components/BuyTicket'))

type EventData = {
  id: string
  name: string
  title: string
  description: string
  bannerImage: string
  date: string
  location: string
  price: string
  featured: boolean
  details?: {
    about?: string
    highlights?: string[]
    image?: string
  }
}

type DetailNavState = {
  contractAddress?: `0x${string}`
  /** Backend tokenId is used as "ticket type count" (options 1..tokenId) */
  tokenId?: string
  chainId?: number
  backendId?: string
  slug?: string
  metadata?: NftMetadata
}

function isHexAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v)
}

type NftMetadata = {
  name?: string
  description?: string
  image?: string
  event?: {
    title?: string
    date?: string
    time?: string
    location?: string
    organizer?: string
  }
}

function prettifySlug(slug: string) {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function dedupeEventsById(events: EventData[]): EventData[] {
  const map = new Map<string, EventData>()
  for (const e of events) {
    if (!e || !e.id) continue
    if (!map.has(e.id)) {
      map.set(e.id, e)
    }
  }
  return Array.from(map.values())
}

function formatDisplayPrice(raw: string | null | undefined) {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return 'ấn vào để xe giá'
  if (/^0+(\.0+)?(\s*eth)?$/i.test(v)) return 'ấn vào để xem giá'
  if (/^liên hệ$/i.test(v)) return 'ấn vào để xem giá'
  return v
}

function mapBackendToEvent(item: any): EventData | null {
  if (!item || typeof item !== 'object') return null
  const slugRaw = item?.name ?? item?.slug
  const slug = typeof slugRaw === 'string' && slugRaw.trim() ? slugRaw.trim() : ''
  if (!slug) return null
  const titleRaw = item?.title ?? item?.eventTitle
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw : prettifySlug(slug)
  return {
    id: slug,
    name: slug,
    title,
    description: typeof item?.description === 'string' ? item.description : '',
    bannerImage: typeof item?.bannerImage === 'string' ? item.bannerImage : '',
    date: typeof item?.date === 'string' ? item.date : '',
    location: typeof item?.location === 'string' ? item.location : '',
    price: typeof item?.price === 'string' ? item.price : '—',
    featured: !!(item?.featured ?? item?.isFeatured ?? true),
    details: typeof item?.details === 'object' ? item.details : undefined,
  }
}

function EventDetail() {
  const { reloadNonce, triggerReload } = useReload()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const navState = (location.state || {}) as DetailNavState
  const [event, setEvent] = useState<EventData | null>(null)
  const [relatedEvents, setRelatedEvents] = useState<EventData[]>([])
  const [showBuy, setShowBuy] = useState(false)
  const [isResolvingEvent, setIsResolvingEvent] = useState(true)
  const [isNotFound, setIsNotFound] = useState(false)
  const prevIdRef = useRef<string | undefined>(undefined)

  const [contractAddress, setContractAddress] = useState<`0x${string}` | null>(null)
  const [ticketTypeCount, setTicketTypeCount] = useState<bigint | null>(null)
  const [meta, setMeta] = useState<NftMetadata | null>(null)

  const resolvedContract = useMemo(() => {
    return contractAddress || null
  }, [contractAddress])

  const defaultTokenId = 1n

  const displayedTitle = event?.title || meta?.event?.title || meta?.name || (id ? prettifySlug(id) : 'Sự kiện')
  const displayedDate =
    event?.date || (meta?.event?.date ? `${meta.event.date}${meta.event.time ? ` • ${meta.event.time}` : ''}` : '')
  const displayedLocation = event?.location || meta?.event?.location || ''
  const displayedDescription = event?.description || meta?.description || ''
  const displayedImage = event?.bannerImage || meta?.image || atraic2Image

  // Price range (tokenId 1..ticketTypeCount): show min-max ETH
  const ticketTypeIds = useMemo(() => {
    const n = ticketTypeCount ?? 3n
    const capped = n > 20n ? 20n : n
    return Array.from({ length: Number(capped) }, (_, i) => BigInt(i + 1))
  }, [ticketTypeCount])

  const { data: priceReads } = useReadContracts({
    contracts:
      resolvedContract
        ? ticketTypeIds.map((tid) => ({
            address: resolvedContract,
            abi: ticket1155Abi,
            functionName: 'ticketPrices',
            args: [tid],
          }))
        : [],
    query: { enabled: !!resolvedContract && ticketTypeIds.length > 0 },
  })

  const priceRangeLabel = useMemo(() => {
    const rows = (priceReads as any[] | undefined) || []
    const prices = rows
      .map((x) => (typeof x?.result === 'bigint' ? (x.result as bigint) : null))
      .filter((x): x is bigint => x !== null)
    if (prices.length === 0) return undefined
    let min = prices[0]
    let max = prices[0]
    for (const p of prices) {
      if (p < min) min = p
      if (p > max) max = p
    }
    const minEth = formatEther(min)
    const maxEth = formatEther(max)
    return min === max ? `${minEth} ETH` : `${minEth} - ${maxEth} ETH`
  }, [priceReads])

  useEffect(() => {
    let cancelled = false
    const prevId = prevIdRef.current
    const idChanged = prevId !== id
    prevIdRef.current = id

    // Only hard-reset UI when navigating to a different event.
    // For reloads on the same event, keep current UI to avoid unmounting BuyTicket.
    if (idChanged) {
      setIsResolvingEvent(true)
      setIsNotFound(false)
      setEvent(null)
      setRelatedEvents([])
    } else {
      setIsResolvingEvent(false)
      setIsNotFound(false)
    }

    async function loadFromBackend() {
      if (!id) return
      try {
        const raw = await getAllEvent()
        const list: unknown =
          Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object'
              ? (raw as any).events ?? (raw as any).data ?? (raw as any).result
              : null

        const arr = Array.isArray(list) ? list : []
        const mapped = dedupeEventsById(
          arr.map((x: any) => mapBackendToEvent(x)).filter((x): x is EventData => !!x),
        )
        const found = mapped.find((x) => x.id === id)
        if (!found || cancelled) {
          if (!cancelled) setIsNotFound(true)
          if (!cancelled) setIsResolvingEvent(false)
          return
        }

        if (!cancelled) {
          setEvent(found)
          setRelatedEvents(
            mapped
              .filter((x) => x.id !== id)
              .sort(() => Math.random() - 0.5)
              .slice(0, 4),
          )
        }
        if (!cancelled) setIsResolvingEvent(false)
      } catch {
        if (!cancelled) setIsNotFound(true)
        if (!cancelled) setIsResolvingEvent(false)
      }
    }

    void loadFromBackend()
    return () => {
      cancelled = true
    }
  }, [id, reloadNonce])

  // (event loading handled in the effect above to avoid "not found" flash)

  // If we have a contract to buy from, auto-open the buy panel for faster UX (banner -> detail -> buy).
  useEffect(() => {
    if (resolvedContract) setShowBuy(true)
  }, [resolvedContract])

  // Resolve contractAddress/tokenId:
  // 1) Prefer router state (from Home.tsx)
  // 2) Fallback to backend getAllEvent (match by slug name === :id)
  useEffect(() => {
    let cancelled = false

    // From router state
    if (navState.contractAddress && isHexAddress(navState.contractAddress)) {
      setContractAddress(navState.contractAddress)
    }

    // Ticket types count: prefer router state tokenId, fallback to backend tokenId, else default 3.
    const fromState =
      navState.tokenId && /^\d+$/.test(navState.tokenId)
        ? (() => {
            try {
              return BigInt(navState.tokenId)
            } catch {
              return null
            }
          })()
        : null

    setTicketTypeCount(fromState ?? 3n)

    // If missing, try backend
    async function loadFromBackend() {
      if (!id) return
      // If we already have both contract + tokenId count from router state, no need to fetch.
      if (navState.contractAddress && navState.tokenId) return

      try {
        const raw = await getAllEvent()
        const list: unknown =
          Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object'
              ? (raw as any).events ?? (raw as any).data ?? (raw as any).result
              : null

        const arr = Array.isArray(list) ? list : []
        const found = arr.find((x: any) => x && typeof x === 'object' && (x.name === id || x.slug === id))
        if (!found || cancelled) return

        const addr = found?.contract?.address
        if (typeof addr === 'string' && isHexAddress(addr)) {
          setContractAddress(addr as `0x${string}`)
        }

        // Backend tokenId is used as "how many ticket types exist" (1..tokenId)
        const tid = found?.tokenId
        if ((typeof tid === 'string' || typeof tid === 'number') && /^\d+$/.test(String(tid))) {
          try {
            setTicketTypeCount(BigInt(String(tid)))
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore: keep fallbacks
      }
    }

    void loadFromBackend()
    return () => {
      cancelled = true
    }
  }, [id, navState.contractAddress, navState.tokenId])

  // Fallback metadata loading from on-chain uri(1) so direct URL still has full metadata.
  const { data: uri } = useReadContract({
    address: resolvedContract ?? undefined,
    abi: ticket1155Abi,
    functionName: 'uri',
    args: [1n],
    query: { enabled: !!resolvedContract && !meta },
  })
  useEffect(() => {
    let cancelled = false
    if (!uri || typeof uri !== 'string') return
    if (meta) return
    
    const uriStr = uri

    async function loadMeta() {
      try {
        const candidates = uriStr.endsWith('.json') ? [uriStr] : [uriStr, `${uriStr}.json`]
        for (const u of candidates) {
          try {
            const res = await fetch(u, { method: 'GET' })
            
            if (!res.ok) continue
            const json = (await res.json()) as any
            if (!json || typeof json !== 'object') continue

            const next: NftMetadata = {
              name: typeof json.name === 'string' ? json.name : undefined,
              description: typeof json.description === 'string' ? json.description : undefined,
              image: typeof json.image === 'string' ? json.image : undefined,
              event:
                json.event && typeof json.event === 'object'
                  ? {
                      title: typeof json.event.title === 'string' ? json.event.title : undefined,
                      date: typeof json.event.date === 'string' ? json.event.date : undefined,
                      time: typeof json.event.time === 'string' ? json.event.time : undefined,
                      location: typeof json.event.location === 'string' ? json.event.location : undefined,
                      organizer: typeof json.event.organizer === 'string' ? json.event.organizer : undefined,
                    }
                  : undefined,
            }
            if (!cancelled) setMeta(next)
            break
          } catch {
            // try next
          }
        }
      } catch {
        // ignore
      }
    }

    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [meta, uri])

  if (isResolvingEvent) {
    return (
      <div
        className="min-h-screen bg-gradient-to-b from-[#3d2817] via-[#5c4033] to-[#1e3a5f] flex items-center justify-center"
        style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}
      >
        <div className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full border-4 border-[#f4d03f]/30 border-t-[#f4d03f] animate-spin" />
          <div className="text-[#f5f1e8] font-semibold">Đang tải sự kiện...</div>
        </div>
      </div>
    )
  }

  if (isNotFound || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d2817] via-[#5c4033] to-[#1e3a5f] flex items-center justify-center" style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#f5f1e8] mb-4" style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
            Không tìm thấy sự kiện
          </h1>
          <button
            type="button"
            onClick={triggerReload}
            className="inline-block mr-3 px-6 py-3 bg-[#3d2817]/40 text-[#f4d03f] font-semibold rounded-xl border border-[#d4af37]/40 hover:bg-[#3d2817]/60 transition-all duration-200"
            style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}
          >
            Tải lại
          </button>
          <Link 
            to="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] font-semibold rounded-xl hover:from-[#f4d03f] hover:to-[#d4af37] transition-all duration-200"
            style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}
          >
            Quay về trang chủ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#23160f] via-[#3d2817] to-[#1e3a5f]" style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <Header />

      <main className="relative">
        {/* Modern hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={displayedImage || backgroundImage}
              alt={event.name}
              className="h-full w-full object-cover opacity-45 blur-[1px] scale-105"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-[#23160f]/65 to-[#23160f]" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-18 lg:pt-20 pb-6 sm:pb-8">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#5c4033]/60 bg-[#3d2817]/30 px-3 py-2 text-sm font-semibold text-[#e8e0d0] hover:bg-[#3d2817]/50 transition-colors"
              >
                <span aria-hidden="true">←</span>
                Quay lại
              </button>
              {event.featured && (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/50 bg-[#d4af37]/15 px-4 py-2 text-xs font-bold text-[#f4d03f]">
                  Nổi bật
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-7 lg:gap-10 items-start">
              <div className="min-w-0">
                {/* Big banner (foreground) */}
                <div className="rounded-2xl border border-[#5c4033]/60 bg-[#3d2817]/25 backdrop-blur-md p-2.5 shadow-xl">
                  <div className="relative aspect-[16/7] sm:aspect-[16/6] overflow-hidden rounded-xl bg-black/20">
                    <img
                      src={displayedImage || backgroundImage}
                      alt={event.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  </div>
                </div>

                <div className="mt-5 min-w-0">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#f5f1e8]">
                  {displayedTitle}
                </h1>

                <p className="mt-3 text-sm sm:text-base text-[#e8e0d0]/90 leading-relaxed">
                  {displayedDescription || '—'}
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-[#5c4033]/60 bg-[#3d2817]/30 px-3 py-2 text-sm text-[#e8e0d0]">
                    <span className="text-[#f4d03f]" aria-hidden="true">🗓</span>
                    <span className="font-semibold">{displayedDate || '—'}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-[#5c4033]/60 bg-[#3d2817]/30 px-3 py-2 text-sm text-[#e8e0d0]">
                    <span className="text-[#f4d03f]" aria-hidden="true">📍</span>
                    <span className="font-semibold">{displayedLocation || '—'}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-[#5c4033]/60 bg-[#3d2817]/30 px-3 py-2 text-sm text-[#e8e0d0]">
                    <span className="text-[#f4d03f]" aria-hidden="true">🎟</span>
                    <span className="font-black text-[#f4d03f]">
                      {priceRangeLabel ? `${priceRangeLabel}` : formatDisplayPrice(event.price)}
                    </span>
                  </div>
                  {meta?.event?.organizer && (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[#5c4033]/60 bg-[#3d2817]/30 px-3 py-2 text-sm text-[#e8e0d0]">
                      <span className="text-[#f4d03f]" aria-hidden="true">🏷</span>
                      <span className="font-semibold">Nhà tổ chức:</span>
                      <span className="font-bold text-[#f4d03f]">{meta.event.organizer}</span>
                    </div>
                  )}
                </div>
                </div>
              </div>

              <aside className="lg:sticky lg:top-24">
                <div className="rounded-2xl border border-[#5c4033]/60 bg-[#3d2817]/35 backdrop-blur-md p-4 sm:p-5 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#f5f1e8]">Mua vé</div>
                      <div className="mt-1 text-xs text-[#e8e0d0]/80">Thanh toán on-chain bằng ví Web3</div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/15 px-3 py-1.5 text-xs font-bold text-[#f4d03f]">
                      Web3
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-[#5c4033]/50 bg-black/15 p-3">
                    <div className="text-[11px] text-[#e8e0d0]/70">Contract</div>
                    <div className="mt-1 text-sm font-semibold text-[#f5f1e8] truncate">{resolvedContract || 'Chưa cấu hình'}</div>
                  </div>

                  {resolvedContract ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setShowBuy(true)}
                        className="w-full rounded-xl bg-gradient-to-r from-[#d4af37] to-[#f4d03f] px-4 py-3 font-extrabold text-[#3d2817] hover:opacity-95 transition-opacity"
                      >
                        Chọn vé & mua ngay
                      </button>

                      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out mt-4 ${showBuy ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <Suspense fallback={<div className="text-sm text-[#e8e0d0]/80">Đang tải module mua vé...</div>}>
                            <BuyTicket
                              contractAddress={resolvedContract}
                              defaultTokenId={defaultTokenId}
                              ticketTypeCount={ticketTypeCount ?? undefined}
                              showTicketTypeSelector={true}
                              embedded
                            />
                          </Suspense>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm text-[#e8e0d0]/85">
                      Event này chưa có contract address. Vui lòng cấu hình trong Admin.
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Details */}
        <section className="py-12 sm:py-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-10">
            <div className="min-w-0 space-y-6">
              {event.details?.about && (
                <div className="rounded-2xl border border-[#5c4033]/60 bg-[#3d2817]/25 backdrop-blur-md p-5 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-black text-[#f5f1e8]">Về sự kiện</h2>
                  <p className="mt-3 text-sm sm:text-base text-[#e8e0d0]/90 leading-relaxed">{event.details.about}</p>
                </div>
              )}

              {event.details?.highlights && event.details.highlights.length > 0 && (
                <div className="rounded-2xl border border-[#5c4033]/60 bg-[#3d2817]/25 backdrop-blur-md p-5 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-black text-[#f5f1e8]">Điểm nổi bật</h2>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {event.details.highlights.map((highlight, idx) => (
                      <div key={idx} className="flex items-start gap-3 rounded-xl border border-[#5c4033]/50 bg-black/15 p-4">
                        <div className="mt-0.5 h-6 w-6 rounded-full bg-[#4a9b8e] text-white flex items-center justify-center shrink-0">✓</div>
                        <div className="text-sm text-[#e8e0d0]/95">{highlight}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden lg:block" />
          </div>
        </section>

        {/* Related Events */}
        {relatedEvents.length > 0 && (
          <section className="py-14 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#3d2817]/25 to-[#1e3a5f]">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-xl sm:text-2xl font-black text-[#f5f1e8] mb-6">Sự kiện liên quan</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {relatedEvents.map((relatedEvent, idx) => (
                  <Link
                    key={`${relatedEvent.id}-${idx}`}
                    to={`/event/${relatedEvent.id}`}
                    className="group bg-[#5c4033]/40 backdrop-blur-md rounded-xl overflow-hidden border border-[#5c4033]/50 hover:border-[#d4af37]/50 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-2xl hover:shadow-[#d4af37]/20"
                  >
                    <div className="relative w-full aspect-[3/2] overflow-hidden bg-[#5c4033]/30">
                      <img
                        src={relatedEvent.bannerImage || atraic2Image}
                        alt={relatedEvent.name}
                        className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="text-base font-bold text-[#f5f1e8] mb-2 line-clamp-2 group-hover:text-[#f4d03f] transition-colors duration-300" style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
                        {relatedEvent.title}
                      </h3>
                      <p className="text-sm text-[#e8e0d0] mb-2" style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
                        {relatedEvent.date}
                      </p>
                      <p className="text-lg font-bold text-[#f4d03f]" style={{ fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
                        {formatDisplayPrice(relatedEvent.price)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default EventDetail
