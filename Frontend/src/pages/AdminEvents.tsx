import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatEther, parseEther } from 'viem'
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import Header from '../components/Header'
import { deleteEventDisplay, getAllEventAdmin, restoreEventDisplay, upsertEventDisplay } from '../api/events'
import { apiFetch, getAuthToken } from '../api/http'
import { ticket1155Abi } from '../abi/ticket1155Abi'
import { FIXED_TICKET_TYPES, ticketTypeLabelById } from '../constants/ticketTypes'

type AdminEventForm = {
  slug: string
  title: string
  description: string
  bannerImage: string
  date: string
  location: string
  price: string
  contractAddress: string
  chainId: string
  tokenId: string
  featured: boolean
  bannerHighlight: boolean
  highlightOrder: string
}

type EventRow = AdminEventForm & {
  id: string
  source: 'backend' | 'admin'
  deleted?: boolean
}

type GroupedEventRow = EventRow & {
  rowKey: string
  tokenIds: string[]
}

function toSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function emptyForm(): AdminEventForm {
  return {
    slug: '',
    title: '',
    description: '',
    bannerImage: '',
    date: '',
    location: '',
    price: '',
    contractAddress: '',
    chainId: '11155111',
    tokenId: '3',
    featured: true,
    bannerHighlight: false,
    highlightOrder: '0',
  }
}

function mapRawToRow(item: any): EventRow | null {
  const slugRaw = item?.name ?? item?.slug
  const slug = typeof slugRaw === 'string' ? toSlug(slugRaw) : ''
  if (!slug) return null

  return {
    id: String(item?.id ?? `row-${slug}`),
    source: String(item?.displayId || '').length > 0 || String(item?.id || '').startsWith('display-') ? 'admin' : 'backend',
    slug,
    title: String(item?.title ?? item?.eventTitle ?? slug),
    description: String(item?.description ?? ''),
    bannerImage: String(item?.bannerImage ?? ''),
    date: String(item?.date ?? ''),
    location: String(item?.location ?? ''),
    price: String(item?.price ?? ''),
    contractAddress: String(item?.contract?.address ?? ''),
    chainId: item?.chainId != null ? String(item.chainId) : String(item?.contract?.chainId ?? ''),
    tokenId: item?.tokenId != null ? String(item.tokenId) : '1',
    featured: Boolean(item?.featured ?? item?.isFeatured ?? true),
    bannerHighlight: Boolean(item?.bannerHighlight ?? false),
    highlightOrder: item?.highlightOrder != null ? String(item.highlightOrder) : '0',
    deleted: Boolean(item?.displayDeleted ?? item?.deleted ?? false),
  }
}

function shortAddress(addr: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function makeDisplayKey(slug: string, chainId?: string, contractAddress?: string) {
  const s = toSlug(slug || '')
  const chain = (chainId || '').trim() || 'unknown'
  const addr = (contractAddress || '').trim().toLowerCase() || 'no-contract'
  return `${chain}:${addr}:${s}`
}

function AdminEventsContent({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { isConnected, address } = useAccount()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleResolved, setRoleResolved] = useState(false)
  const [rows, setRows] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)
  const [form, setForm] = useState<AdminEventForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [priceContractAddress, setPriceContractAddress] = useState('')
  const [priceTokenId, setPriceTokenId] = useState('1')
  const [priceEth, setPriceEth] = useState('')
  const [priceError, setPriceError] = useState<string | null>(null)
  const [saleError, setSaleError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const [isSyncingFromContract, setIsSyncingFromContract] = useState(false)
  const { writeContract, data: priceTxHash, isPending: isPriceTxPending } = useWriteContract()
  const {
    writeContract: writeSaleContract,
    data: saleTxHash,
    isPending: isSaleTxPending,
  } = useWriteContract()
  const { isLoading: isPriceTxConfirming, isSuccess: isPriceTxConfirmed } = useWaitForTransactionReceipt({
    hash: priceTxHash,
  })
  const { isLoading: isSaleTxConfirming, isSuccess: isSaleTxConfirmed } = useWaitForTransactionReceipt({
    hash: saleTxHash,
  })

  const validPriceContract = /^0x[a-fA-F0-9]{40}$/.test(priceContractAddress.trim())
    ? (priceContractAddress.trim() as `0x${string}`)
    : undefined
  const validPriceTokenId = /^\d+$/.test(priceTokenId.trim()) ? BigInt(priceTokenId.trim()) : undefined
  const canWriteOnchain = isConnected && !!address && !!getAuthToken() && (userRole === 'OWNER' || userRole === 'STAFF')
  const canReadCurrentPrice = !!validPriceContract && validPriceTokenId !== undefined
  const { data: currentPriceWei, isLoading: currentPriceLoading } = useReadContract({
    address: validPriceContract,
    abi: ticket1155Abi,
    functionName: 'ticketPrices',
    args: validPriceTokenId !== undefined ? [validPriceTokenId] : undefined,
    query: { enabled: canReadCurrentPrice },
  })
  const { data: eventPausedRaw, isLoading: eventPausedLoading } = useReadContract({
    address: validPriceContract,
    abi: ticket1155Abi,
    functionName: 'paused',
    query: { enabled: !!validPriceContract },
  })

  const formContractAddress = form.contractAddress.trim()
  const validFormContract = /^0x[a-fA-F0-9]{40}$/.test(formContractAddress)
    ? (formContractAddress as `0x${string}`)
    : undefined
  const canSyncFromContract = !!validFormContract
  const { refetch: refetchUriFromContract } = useReadContract({
    address: validFormContract,
    abi: ticket1155Abi,
    functionName: 'uri',
    args: [1n],
    query: { enabled: false },
  })
  const { refetch: refetchFixedTypePrices } = useReadContracts({
    contracts:
      validFormContract
        ? FIXED_TICKET_TYPES.map((t) => ({
            address: validFormContract,
            abi: ticket1155Abi,
            functionName: 'ticketPrices',
            args: [BigInt(t.tokenId)],
          }))
        : [],
    query: { enabled: false },
  })

  const deletedMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const r of rows) {
      if (r.deleted) map.set(makeDisplayKey(r.slug, r.chainId, r.contractAddress), true)
    }
    return map
  }, [rows])

  const visibleRows = useMemo(() => {
    if (showDeleted) return rows
    return rows.filter((r) => !deletedMap.has(makeDisplayKey(r.slug, r.chainId, r.contractAddress)))
  }, [rows, showDeleted, deletedMap])

  const groupedVisibleRows = useMemo(() => {
    const map = new Map<string, GroupedEventRow>()
    
    for (const row of visibleRows) {
      const key = makeDisplayKey(row.slug, row.chainId, row.contractAddress)
      const current = map.get(key)
      if (!current) {
        map.set(key, {
          ...row,
          rowKey: key,
          tokenIds: row.tokenId ? [row.tokenId] : [],
        })
        continue
      }


      if (row.tokenId && !current.tokenIds.includes(row.tokenId)) {
        current.tokenIds.push(row.tokenId)
      }

      // Prefer richer text fields if current one is empty.
      if (!current.description && row.description) current.description = row.description
      if (!current.bannerImage && row.bannerImage) current.bannerImage = row.bannerImage
      if (!current.location && row.location) current.location = row.location
      if (!current.date && row.date) current.date = row.date
      if (!current.price && row.price) current.price = row.price
      if (!current.contractAddress && row.contractAddress) current.contractAddress = row.contractAddress
      if (!current.chainId && row.chainId) current.chainId = row.chainId
    }

    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title))
  }, [visibleRows])

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const raw = await getAllEventAdmin()
      const list: unknown =
        Array.isArray(raw) ? raw : raw && typeof raw === "object" ? (raw as any).events ?? (raw as any).data ?? (raw as any).result : []
      const arr = Array.isArray(list) ? list : []
      const mapped = arr.map((x) => mapRawToRow(x)).filter((x): x is EventRow => !!x)
      setRows(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function resolveRole() {
      if (!isConnected || !address || !getAuthToken()) {
        if (!cancelled) {
          setUserRole(null)
          setRoleResolved(true)
        }
        return
      }
      setRoleResolved(false)
      try {
        const json = await apiFetch<{ user?: { role?: string } }>('/me', { method: 'GET' })
        if (!cancelled) {
          setUserRole(json?.user?.role || null)
          setRoleResolved(true)
        }
      } catch {
        if (!cancelled) {
          setUserRole(null)
          setRoleResolved(true)
        }
      }
    }
    void resolveRole()
    return () => {
      cancelled = true
    }
  }, [address, isConnected])

  const selectedDeleted = selectedRowKey ? deletedMap.get(selectedRowKey) === true : false
  const priceEventTargets = useMemo(() => {
    const map = new Map<
      string,
      { key: string; contractAddress: string; title: string; tokenTypeCount: number }
    >()
    for (const r of groupedVisibleRows) {
      if (r.deleted || !/^0x[a-fA-F0-9]{40}$/.test(r.contractAddress)) continue
      const key = r.contractAddress.toLowerCase()
      const tokenTypeCount = Math.max(
        1,
        ...(r.tokenIds.length > 0 ? r.tokenIds.map((tid) => Number(tid) || 0) : [Number(r.tokenId || 1) || 1]),
      )
      const current = map.get(key)
      if (!current) {
        map.set(key, {
          key,
          contractAddress: r.contractAddress,
          title: r.title || r.slug,
          tokenTypeCount,
        })
      } else if (tokenTypeCount > current.tokenTypeCount) {
        current.tokenTypeCount = tokenTypeCount
      }
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title))
  }, [groupedVisibleRows])

  const selectedPriceEventTarget = useMemo(() => {
    const addr = priceContractAddress.trim().toLowerCase()
    return priceEventTargets.find((x) => x.contractAddress.toLowerCase() === addr)
  }, [priceContractAddress, priceEventTargets])

  const selectedPriceTokenOptions = useMemo(() => {
    const count = selectedPriceEventTarget?.tokenTypeCount || 1
    return Array.from({ length: count }, (_, idx) => String(idx + 1))
  }, [selectedPriceEventTarget])
  const { data: allTypeInfoRaw, isLoading: allTypeInfoLoading } = useReadContracts({
    contracts:
      validPriceContract && selectedPriceTokenOptions.length > 0
        ? selectedPriceTokenOptions.map((tid) => ({
            address: validPriceContract,
            abi: ticket1155Abi,
            functionName: 'getTicketType',
            args: [BigInt(tid)],
          }))
        : [],
    query: { enabled: !!validPriceContract && selectedPriceTokenOptions.length > 0 },
  })

  useEffect(() => {
    if (selectedPriceTokenOptions.length === 0) {
      setPriceTokenId('1')
      return
    }
    if (!selectedPriceTokenOptions.includes(priceTokenId)) {
      setPriceTokenId(selectedPriceTokenOptions[0])
    }
  }, [priceTokenId, selectedPriceTokenOptions])

  const summary = useMemo(() => {
    const total = groupedVisibleRows.length
    const highlighted = groupedVisibleRows.filter((x) => x.bannerHighlight).length
    const deleted = rows.filter((x) => x.deleted).length
    return { total, highlighted, deleted }
  }, [groupedVisibleRows, rows])

  const eventSaleSummary = useMemo(() => {
    const rowsRaw = (allTypeInfoRaw as any[]) || []
    let totalMax = 0n
    let totalSold = 0n
    let totalBurned = 0n
    let activeTypes = 0
    let knownTypes = 0
    for (const row of rowsRaw) {
      const info = row?.result
      if (!info) continue
      const max = typeof info?.[1] === 'bigint' ? (info[1] as bigint) : 0n
      const sold = typeof info?.[2] === 'bigint' ? (info[2] as bigint) : 0n
      const active = typeof info?.[3] === 'boolean' ? (info[3] as boolean) : false
      const burned = typeof info?.[4] === 'bigint' ? (info[4] as bigint) : 0n
      totalMax += max
      totalSold += sold
      totalBurned += burned
      knownTypes += 1
      if (active) activeTypes += 1
    }
    return {
      knownTypes,
      activeTypes,
      totalMax,
      totalSold,
      totalBurned,
      totalHolding: totalSold > totalBurned ? totalSold - totalBurned : 0n,
      totalRemainingForSale: totalMax > totalSold ? totalMax - totalSold : 0n,
    }
  }, [allTypeInfoRaw])

  const eventPaused = typeof eventPausedRaw === 'boolean' ? eventPausedRaw : undefined

  function startCreate() {
    setSelectedSlug(null)
    setSelectedRowKey(null)
    setForm(emptyForm())
  }

  function startEdit(row: EventRow) {
    const key = makeDisplayKey(row.slug, row.chainId, row.contractAddress)
    setSelectedSlug(row.slug)
    setSelectedRowKey(key)
    setForm({
      slug: row.slug,
      title: row.title,
      description: row.description,
      bannerImage: row.bannerImage,
      date: row.date,
      location: row.location,
      price: row.price,
      contractAddress: row.contractAddress,
      chainId: row.chainId || '11155111',
      tokenId: row.tokenId || '1',
      featured: row.featured,
      bannerHighlight: row.bannerHighlight,
      highlightOrder: row.highlightOrder || '0',
    })
    if (row.contractAddress) setPriceContractAddress(row.contractAddress)
    if (row.tokenId) setPriceTokenId(row.tokenId)
  }

  async function saveForm() {
    setSaving(true)
    try {
      const slug = toSlug(form.slug)
      if (!slug) throw new Error('Slug không hợp lệ')
      if (!form.title.trim()) throw new Error('Vui lòng nhập tên sự kiện')
      const chainId = /^\d+$/.test(form.chainId.trim()) ? Number(form.chainId.trim()) : NaN
      if (!Number.isFinite(chainId) || chainId <= 0) throw new Error('ChainId không hợp lệ')
      const contractAddress = form.contractAddress.trim()
      if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) throw new Error('Contract address không hợp lệ')
      const highlightOrder = /^\d+$/.test(form.highlightOrder.trim()) ? Number(form.highlightOrder.trim()) : 0

      await upsertEventDisplay({
        slug,
        title: form.title.trim(),
        description: form.description.trim(),
        bannerImage: form.bannerImage.trim(),
        date: form.date.trim(),
        location: form.location.trim(),
        displayPrice: form.price.trim(),
        contractAddress,
        chainId,
        defaultTokenId: /^\d+$/.test(form.tokenId.trim()) ? form.tokenId.trim() : '3',
        featured: form.featured,
        bannerHighlight: form.bannerHighlight,
        highlightOrder,
        deleted: false,
      })
      await reload()
      setSelectedSlug(slug)
      setSelectedRowKey(makeDisplayKey(slug, String(chainId), contractAddress))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function removeSelected() {
    if (!selectedSlug) return
    try {
      const chainId = /^\d+$/.test(form.chainId.trim()) ? Number(form.chainId.trim()) : NaN
      const contractAddress = form.contractAddress.trim()
      if (!Number.isFinite(chainId) || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        throw new Error('Cần chainId + contractAddress hợp lệ để xóa hiển thị.')
      }
      await deleteEventDisplay({ slug: selectedSlug, chainId, contractAddress })
      await reload()
      setSelectedSlug(null)
      setSelectedRowKey(null)
      setForm(emptyForm())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function restoreSelected() {
    if (!selectedSlug) return
    try {
      const chainId = /^\d+$/.test(form.chainId.trim()) ? Number(form.chainId.trim()) : NaN
      const contractAddress = form.contractAddress.trim()
      if (!Number.isFinite(chainId) || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        throw new Error('Cần chainId + contractAddress hợp lệ để khôi phục hiển thị.')
      }
      await restoreEventDisplay({ slug: selectedSlug, chainId, contractAddress })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function syncFromContractAddress() {
    setSyncError(null)
    setSyncInfo(null)
    if (!canSyncFromContract || !validFormContract) {
      setSyncError('Vui lòng nhập contractAddress hợp lệ trước khi đồng bộ.')
      return
    }

    setIsSyncingFromContract(true)
    try {
      const [uriRes, pricesRes] = await Promise.all([refetchUriFromContract(), refetchFixedTypePrices()])
      const uri = typeof uriRes.data === 'string' ? uriRes.data : undefined

      // Fill missing display price from fixed ticket prices (1/2/3)
      const priceValues = ((pricesRes.data as any[]) || [])
        .map((x) => (typeof x?.result === 'bigint' ? (x.result as bigint) : undefined))
        .filter((x): x is bigint => typeof x === 'bigint')
      if (!form.price && priceValues.length > 0) {
        let min = priceValues[0]
        let max = priceValues[0]
        for (const p of priceValues) {
          if (p < min) min = p
          if (p > max) max = p
        }
        const range = min === max ? `${formatEther(min)} ETH` : `${formatEther(min)} - ${formatEther(max)} ETH`
        setForm((prev) => ({ ...prev, price: range }))
      }

      if (!uri) {
        setSyncInfo('Đã đọc giá vé cố định #1/#2/#3 từ contract. Không tìm thấy URI metadata để đồng bộ mô tả/banner.')
        return
      }

      const candidates = uri.endsWith('.json') ? [uri] : [uri, `${uri}.json`]
      let metadata: any = null
      for (const u of candidates) {
        try {
          const res = await fetch(u, { method: 'GET' })
          if (!res.ok) continue
          const json = await res.json()
          if (json && typeof json === 'object') {
            metadata = json
            break
          }
        } catch {
          // continue
        }
      }

      if (!metadata) {
        setSyncInfo('Đã đọc dữ liệu contract, nhưng chưa lấy được metadata JSON từ URI.')
        return
      }

      const title = metadata?.event?.title || metadata?.name
      const description = metadata?.description
      const bannerImage = metadata?.image
      const date = metadata?.event?.date
      const time = metadata?.event?.time
      const location = metadata?.event?.location

      setForm((prev) => {
        const nextSlug = prev.slug || toSlug(String(title || ''))
        const nextDate = prev.date || [date, time].filter(Boolean).join(' • ')
        return {
          ...prev,
          slug: nextSlug,
          title: prev.title || String(title || ''),
          description: prev.description || String(description || ''),
          bannerImage: prev.bannerImage || String(bannerImage || ''),
          date: nextDate || prev.date,
          location: prev.location || String(location || ''),
          tokenId: prev.tokenId || '3',
        }
      })

      setSyncInfo('Đã đồng bộ dữ liệu từ contractAddress thành công. Bạn có thể chỉnh sửa trước khi lưu.')
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsSyncingFromContract(false)
    }
  }

  function updateTicketPriceOnchain() {
    setPriceError(null)
    if (!isConnected || !address) {
      setPriceError('Vui lòng kết nối ví admin/owner để chỉnh giá.')
      return
    }
    if (!getAuthToken()) {
      setPriceError('Ví đã kết nối nhưng chưa đăng nhập bằng chữ ký. Vui lòng Sign in lại.')
      return
    }
    if (roleResolved && userRole !== 'OWNER' && userRole !== 'STAFF') {
      setPriceError('Tài khoản hiện tại không có quyền admin (OWNER/STAFF) để chỉnh giá.')
      return
    }
    if (!validPriceContract) {
      setPriceError('Contract address không hợp lệ.')
      return
    }
    if (validPriceTokenId === undefined) {
      setPriceError('TokenId không hợp lệ.')
      return
    }
    const input = priceEth.trim()
    if (!input) {
      setPriceError('Vui lòng nhập giá ETH.')
      return
    }
    try {
      const wei = parseEther(input)
      writeContract({
        address: validPriceContract,
        abi: ticket1155Abi,
        functionName: 'setTicketPrice',
        args: [validPriceTokenId, wei],
      })
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : String(e))
    }
  }

  function setEventPaused(nextPaused: boolean) {
    setSaleError(null)
    if (!canWriteOnchain) {
      setSaleError('Vui lòng kết nối ví admin/owner và đăng nhập chữ ký để thao tác on-chain.')
      return
    }
    if (!validPriceContract) {
      setSaleError('Vui lòng chọn contract hợp lệ.')
      return
    }
    try {
      writeSaleContract({
        address: validPriceContract,
        abi: ticket1155Abi,
        functionName: nextPaused ? 'pause' : 'unpause',
      })
    } catch (e) {
      setSaleError(e instanceof Error ? e.message : String(e))
    }
  }

  const onchainPanel = (
    <div className="rounded-2xl border border-[#5c4033]/50 bg-[#3d2817]/60 backdrop-blur-md p-4 sm:p-6 shadow-xl">
      <h3 className="text-base sm:text-lg font-bold text-[#f4d03f] mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
        Quản lý on-chain sự kiện
      </h3>
      <p className="text-xs sm:text-sm text-[#e8e0d0]/80 mb-3">
        Chọn contract sự kiện trước, sau đó thao tác theo từng phần riêng.
      </p>

      <div className="space-y-2">
        <select
          value={selectedPriceEventTarget ? `${selectedPriceEventTarget.contractAddress.toLowerCase()}` : ''}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            setPriceContractAddress(v)
            setPriceTokenId('1')
          }}
          className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm"
        >
          <option value="">Chọn sự kiện/contract để chỉnh giá</option>
          {priceEventTargets.map((t) => (
            <option key={t.key} value={`${t.contractAddress.toLowerCase()}`} style={{ color: '#111' }}>
              {t.title} • {shortAddress(t.contractAddress)} • {t.tokenTypeCount} loại vé
            </option>
          ))}
        </select>
        <input
          value={priceContractAddress}
          onChange={(e) => setPriceContractAddress(e.target.value)}
          placeholder="Smartcontract address"
          className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm"
        />
      </div>
      {selectedPriceEventTarget && (
        <div className="mt-2 text-xs text-[#a7f3d0]">
          Đang quản lý: <span className="font-semibold">{selectedPriceEventTarget.title}</span>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-[#5c4033]/60 bg-black/10 p-3 sm:p-4">
        <div className="text-sm font-semibold text-[#f4d03f] mb-2">1) Cập nhật giá</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={priceTokenId}
            onChange={(e) => setPriceTokenId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm"
          >
            {selectedPriceTokenOptions.map((tid) => (
              <option key={tid} value={tid} style={{ color: '#111' }}>
                {ticketTypeLabelById(tid)} (#{tid})
              </option>
            ))}
          </select>
          <input
            value={priceEth}
            onChange={(e) => setPriceEth(e.target.value)}
            placeholder="Giá mới (ETH), vd: 0.01"
            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm"
          />
        </div>
        <div className="mt-2 text-xs text-[#e8e0d0]/80">
          Giá hiện tại:{' '}
          {currentPriceLoading ? 'Đang đọc...' : typeof currentPriceWei === 'bigint' ? `${formatEther(currentPriceWei)} ETH` : 'N/A'}
        </div>
        <button
          type="button"
          onClick={updateTicketPriceOnchain}
          disabled={isPriceTxPending || isPriceTxConfirming}
          className="mt-3 px-4 py-2 rounded-lg bg-linear-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] font-semibold disabled:opacity-60"
        >
          {isPriceTxPending ? 'Đang ký...' : isPriceTxConfirming ? 'Đang xác nhận...' : 'Cập nhật giá'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-[#5c4033]/60 bg-black/10 p-3 sm:p-4">
        <div className="text-sm font-semibold text-[#f4d03f] mb-2">2) Số lượng vé còn lại</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="h-full rounded-lg border border-[#5c4033]/60 bg-black/10 p-2.5 flex flex-col">
            <div className="text-[10px] text-[#e8e0d0]/70 min-h-[30px]">Còn lại để bán</div>
            <div className="mt-auto text-sm font-semibold text-[#86efac]">
              {allTypeInfoLoading ? '...' : eventSaleSummary.totalRemainingForSale.toString()}
            </div>
          </div>
          <div className="h-full rounded-lg border border-[#5c4033]/60 bg-black/10 p-2.5 flex flex-col">
            <div className="text-[10px] text-[#e8e0d0]/70 min-h-[30px]">Đã bán (mint)</div>
            <div className="mt-auto text-sm font-semibold text-[#f5f1e8]">
              {allTypeInfoLoading ? '...' : eventSaleSummary.totalSold.toString()}
            </div>
          </div>
          <div className="h-full rounded-lg border border-[#5c4033]/60 bg-black/10 p-2.5 flex flex-col">
            <div className="text-[10px] text-[#e8e0d0]/70 min-h-[30px]">Đã check-in (burn)</div>
            <div className="mt-auto text-sm font-semibold text-[#bfdbfe]">
              {allTypeInfoLoading ? '...' : eventSaleSummary.totalBurned.toString()}
            </div>
          </div>
          <div className="h-full rounded-lg border border-[#5c4033]/60 bg-black/10 p-2.5 flex flex-col">
            <div className="text-[10px] text-[#e8e0d0]/70 min-h-[30px]">Đang sở hữu</div>
            <div className="mt-auto text-sm font-semibold text-[#a7f3d0]">
              {allTypeInfoLoading ? '...' : eventSaleSummary.totalHolding.toString()}
            </div>
          </div>
          <div className="h-full rounded-lg border border-[#5c4033]/60 bg-black/10 p-2.5 flex flex-col">
            <div className="text-[10px] text-[#e8e0d0]/70 min-h-[30px]">Tổng giới hạn</div>
            <div className="mt-auto text-sm font-semibold text-[#f4d03f]">
              {allTypeInfoLoading ? '...' : eventSaleSummary.totalMax.toString()}
            </div>
          </div>
        </div>
      </div>

      {priceError && <div className="mt-2 text-xs text-[#fca5a5]">{priceError}</div>}
      {saleError && <div className="mt-2 text-xs text-[#fca5a5]">{saleError}</div>}
      {priceTxHash && <div className="mt-2 text-xs text-[#e8e0d0]/80 break-all">Tx: {priceTxHash}</div>}
      {saleTxHash && <div className="mt-2 text-xs text-[#e8e0d0]/80 break-all">Tx on-chain: {saleTxHash}</div>}
      {isPriceTxConfirming && <div className="mt-1 text-xs text-[#f4d03f]">Đang chờ xác nhận giao dịch...</div>}
      {isPriceTxConfirmed && <div className="mt-1 text-xs text-[#86efac]">Cập nhật giá thành công trên blockchain.</div>}
      {isSaleTxConfirming && <div className="mt-1 text-xs text-[#f4d03f]">Đang chờ xác nhận thao tác bán vé...</div>}
      {isSaleTxConfirmed && <div className="mt-1 text-xs text-[#86efac]">Cập nhật trạng thái bán vé thành công.</div>}

      <div className="mt-4 text-xs text-[#e8e0d0]/75">
        Trạng thái toàn sự kiện:{' '}
        {eventPausedLoading
          ? 'Đang đọc...'
          : eventPaused === undefined
            ? 'N/A'
            : eventPaused
              ? 'Đang pause (dừng toàn bộ)'
              : 'Đang mở bán'}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEventPaused(true)}
          disabled={isSaleTxPending || isSaleTxConfirming || !canWriteOnchain}
          className="px-4 py-2.5 rounded-xl border border-[#f59e0b]/50 bg-linear-to-r from-[#7c2d12]/55 to-[#92400e]/45 text-[#fde68a] font-semibold shadow-md hover:from-[#9a3412]/65 hover:to-[#b45309]/55 transition-all disabled:opacity-60"
        >
          Dừng bán toàn sự kiện
        </button>
        <button
          type="button"
          onClick={() => setEventPaused(false)}
          disabled={isSaleTxPending || isSaleTxConfirming || !canWriteOnchain}
          className="px-4 py-2.5 rounded-xl border border-[#60a5fa]/50 bg-linear-to-r from-[#1e3a8a]/55 to-[#1e40af]/45 text-[#dbeafe] font-semibold shadow-md hover:from-[#1d4ed8]/65 hover:to-[#2563eb]/55 transition-all disabled:opacity-60"
        >
          Tiếp tục bán toàn sự kiện
        </button>
      </div>
    </div>
  )

  return (
    <div
      className={embedded ? '' : 'min-h-screen bg-linear-to-b from-[#1e3a5f]/60 via-[#3d2817]/60 to-[#1e3a5f]/60'}
      style={embedded ? undefined : { fontFamily: "'Lora', serif" }}
    >
      {!embedded && <Header />}

      <main
        className={
          embedded
            ? 'max-w-[1440px] mx-auto px-0 py-4'
            : 'max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-10'
        }
      >
        {!embedded && (
          <div className="mb-6 rounded-2xl border border-[#5c4033]/50 bg-[#3d2817]/55 backdrop-blur-md p-4 sm:p-6 flex items-center justify-between">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold text-[#f4d03f]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Admin • Quản Lý Sự Kiện
              </h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-4 py-2 rounded-lg border border-[#5c4033]/60 bg-[#3d2817]/60 text-[#e8e0d0] hover:bg-[#5c4033]/60"
            >
              Về Admin
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
          <section className="bg-[#3d2817]/60 backdrop-blur-md rounded-2xl border border-[#5c4033]/50 p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-[#f4d03f]" style={{ fontFamily: "'Playfair Display', serif" }}>
                Danh sách sự kiện
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleted((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 text-xs sm:text-sm text-[#e8e0d0] hover:bg-[#5c4033]/40"
                >
                  {showDeleted ? 'Ẩn đã xóa' : 'Hiện đã xóa'}
                </button>
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="px-3 py-1.5 rounded-lg border border-[#d4af37]/50 text-xs sm:text-sm text-[#f4d03f] hover:bg-[#3d2817]/40"
                >
                  Tải lại
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="rounded-xl border border-[#5c4033]/50 bg-black/15 p-3">
                <div className="text-[10px] sm:text-xs text-[#e8e0d0]/70">Tổng sự kiện</div>
                <div className="text-lg sm:text-xl font-bold text-[#f5f1e8]">{summary.total}</div>
              </div>
              <div className="rounded-xl border border-[#5c4033]/50 bg-black/15 p-3">
                <div className="text-[10px] sm:text-xs text-[#e8e0d0]/70">Đang highlight</div>
                <div className="text-lg sm:text-xl font-bold text-[#bfdbfe]">{summary.highlighted}</div>
              </div>
              <div className="rounded-xl border border-[#5c4033]/50 bg-black/15 p-3">
                <div className="text-[10px] sm:text-xs text-[#e8e0d0]/70">Đã xóa</div>
                <div className="text-lg sm:text-xl font-bold text-[#fecaca]">{summary.deleted}</div>
              </div>
            </div>

            {loading && <div className="text-sm text-[#e8e0d0]/80">Đang tải dữ liệu sự kiện...</div>}
            {error && <div className="text-sm text-[#fca5a5] mb-3">Lỗi: {error}</div>}

            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {groupedVisibleRows.map((row) => {
                const isDeleted = deletedMap.has(row.rowKey)
                const active = selectedRowKey === row.rowKey
                return (
                  <button
                    key={row.rowKey}
                    type="button"
                    onClick={() => startEdit(row)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? 'border-[#d4af37]/70 bg-[#5c4033]/55 shadow-[0_0_0_1px_rgba(212,175,55,0.15)]'
                        : 'border-[#5c4033]/50 bg-[#3d2817]/40 hover:bg-[#5c4033]/40 hover:border-[#d4af37]/35'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-[#f5f1e8] truncate">{row.title}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded border border-[#5c4033]/60 text-[#e8e0d0]/80">
                          {row.source === 'admin' ? 'Admin' : 'Backend'}
                        </span>
                        {isDeleted && (
                          <span className="text-[10px] px-2 py-0.5 rounded border border-[#ef4444]/60 text-[#fecaca]">
                            Đã xóa
                          </span>
                        )}
                        {row.bannerHighlight && (
                          <span className="text-[10px] px-2 py-0.5 rounded border border-[#60a5fa]/60 text-[#bfdbfe]">
                            Banner
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-[#e8e0d0]/75 mt-1 truncate">{row.slug}</div>
                    <div className="text-[10px] text-[#e8e0d0]/65 mt-1 truncate">
                      {shortAddress(row.contractAddress)} • chain {row.chainId || 'N/A'}
                    </div>
                    {row.tokenIds.length > 0 && (
                      <div className="mt-2 text-[10px] text-[#f4d03f]/85">
                        Số loại vé: {Math.max(...row.tokenIds.map((tid) => Number(tid) || 0))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="mt-6">
              {onchainPanel}
            </div>
          </section>

          <section className="bg-[#3d2817]/60 backdrop-blur-md rounded-2xl border border-[#5c4033]/50 p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-[#f4d03f]" style={{ fontFamily: "'Playfair Display', serif" }}>
                {selectedSlug ? 'Sửa sự kiện' : 'Tạo sự kiện'}
              </h2>
              <button
                type="button"
                onClick={startCreate}
                className="px-3 py-1.5 rounded-lg border border-[#d4af37]/50 text-xs sm:text-sm text-[#f4d03f] hover:bg-[#3d2817]/40"
              >
                Tạo mới
              </button>
            </div>

            <div className="mb-3 text-[11px] text-[#e8e0d0]/70">
              Khu vực này quản lý dữ liệu hiển thị. Không ảnh hưởng logic mua/bán trên contract.
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Slug sự kiện</div>
                <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="vd: anh-trai-say-hi" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
              </div>
              <div>
                <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Tên sự kiện</div>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Tên sự kiện" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
              </div>
              <div>
                <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Mô tả sự kiện</div>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Mô tả sự kiện" className="w-full h-24 px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm resize-none" />
              </div>
              <div>
                <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Banner URL</div>
                <input value={form.bannerImage} onChange={(e) => setForm((f) => ({ ...f, bannerImage: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Ngày giờ hiển thị</div>
                  <input value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} placeholder="Ngày giờ" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
                </div>
                <div>
                  <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Địa điểm</div>
                  <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Địa điểm" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Giá hiển thị</div>
                <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="vd: Từ 0.01 ETH" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Contract address</div>
                  <input value={form.contractAddress} onChange={(e) => setForm((f) => ({ ...f, contractAddress: e.target.value }))} placeholder="0x..." className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
                </div>
                <div>
                  <div className="text-[11px] text-[#e8e0d0]/80 mb-1">ChainId</div>
                  <input value={form.chainId} onChange={(e) => setForm((f) => ({ ...f, chainId: e.target.value }))} placeholder="11155111" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-[#e8e0d0]/80 mb-1">Số loại vé</div>
                  <input value={form.tokenId} onChange={(e) => setForm((f) => ({ ...f, tokenId: e.target.value }))} placeholder="vd: 3" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm" />
                </div>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#5c4033]/60 text-[#e8e0d0] text-sm">
                  <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} />
                  Nổi bật (featured)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#5c4033]/60 text-[#e8e0d0] text-sm">
                  <input
                    type="checkbox"
                    checked={form.bannerHighlight}
                    onChange={(e) => setForm((f) => ({ ...f, bannerHighlight: e.target.checked }))}
                  />
                  Banner highlight trang chủ
                </label>
                <input
                  value={form.highlightOrder}
                  onChange={(e) => setForm((f) => ({ ...f, highlightOrder: e.target.value }))}
                  placeholder="Thứ tự hiển thị (0 trước, rồi 1,2...)"
                  className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[#5c4033]/60 text-[#f5f1e8] text-sm"
                />
              </div>
              <div className="rounded-lg border border-[#5c4033]/60 bg-black/10 p-3">
                <div className="text-xs text-[#f4d03f] font-semibold mb-1">Loại vé cố định của hệ thống</div>
                <div className="text-xs text-[#e8e0d0]/80">
                  {FIXED_TICKET_TYPES.map((t) => `#${t.tokenId} ${t.label}`).join(' • ')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void syncFromContractAddress()}
                  disabled={isSyncingFromContract}
                  className="px-3 py-1.5 rounded-lg border border-[#60a5fa]/50 bg-[#1e3a5f]/30 text-[#bfdbfe] text-xs sm:text-sm font-semibold hover:bg-[#1e3a5f]/50 disabled:opacity-60"
                >
                  {isSyncingFromContract ? 'Đang đồng bộ...' : 'Lấy dữ liệu từ contractAddress'}
                </button>
                <span className="text-[11px] text-[#e8e0d0]/70">
                  Thiếu dữ liệu sẽ được tự điền, bạn vẫn có thể chỉnh tay.
                </span>
              </div>
              {syncInfo && <div className="text-xs text-[#86efac]">{syncInfo}</div>}
              {syncError && <div className="text-xs text-[#fca5a5]">{syncError}</div>}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveForm()}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-linear-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] font-semibold disabled:opacity-60"
              >
                {saving ? 'Đang lưu...' : 'Lưu hiển thị'}
              </button>
              {selectedRowKey && (
                <button
                  type="button"
                  onClick={() => void removeSelected()}
                  className="px-4 py-2 rounded-lg border border-[#ef4444]/50 bg-[#7f1d1d]/30 text-[#fecaca] hover:bg-[#7f1d1d]/50"
                >
                  Xóa khỏi hiển thị
                </button>
              )}
              {selectedRowKey && selectedDeleted && (
                <button
                  type="button"
                  onClick={() => void restoreSelected()}
                  className="px-4 py-2 rounded-lg border border-[#34d399]/50 bg-[#064e3b]/40 text-[#d1fae5] hover:bg-[#065f46]/50"
                >
                  Khôi phục
                </button>
              )}
            </div>

          </section>
        </div>
      </main>
    </div>
  )
}

export default function AdminEvents() {
  return <AdminEventsContent />
}

export function AdminEventsEmbedded() {
  return <AdminEventsContent embedded />
}
