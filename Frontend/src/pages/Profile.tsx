import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAccount, useBalance, useDisconnect, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { ticket1155Abi } from '../abi/ticket1155Abi'
import { MyOnchainTicket } from '../interface/profile'
import { TokenMetadata } from '../type/profile'
import { apiFetch, getAuthToken } from '../api/http'
import { issueTicket } from '../api/tickets'
import { useReload } from '../hooks/useReload'

function isHexAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v)
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}


// Default scan range for ticket types: 1..3 (Thường/VIP/VVIP)
const DEFAULT_TOKEN_IDS_TO_SCAN = [1n, 2n, 3n] as const



function normalizeIpfsUri(uri: string) {
  // Project uses https gateways already (set from backend / metadata),
  // so keep URIs as-is (no ipfs:// rewrites).
  return uri
}

function safeString(v: unknown) {
  return typeof v === 'string' ? v : undefined
}

function guessTicketTypeLabel(tokenId: bigint): string {
  // Fallback mapping: tokenId 1/2/3 = Thường/VIP/VVIP
  if (tokenId === 1n) return 'Thường'
  if (tokenId === 2n) return 'VIP'
  if (tokenId === 3n) return 'VVIP'
  return `Vé số ${tokenId.toString()}`
}

function ticketTypeBadgeClass(label: string) {
  const v = label.trim().toLowerCase()
  // Thường
  if (v === 'thường' || v === 'thuong' || v === 'standard' || v === 'regular') {
    return 'bg-[#94a3b8]/20 text-[#cbd5e1] border border-[#94a3b8]/40'
  }
  // VIP
  if (v === 'vip') {
    return 'bg-[#f59e0b]/20 text-[#fcd34d] border border-[#f59e0b]/40'
  }
  // VVIP
  if (v === 'vvip' || v === 'v-vip') {
    return 'bg-[#a855f7]/20 text-[#e9d5ff] border border-[#a855f7]/40'
  }
  // fallback
  return 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40'
}

function Profile() {
  const navigate = useNavigate()
  const { address, isConnected, isReconnecting } = useAccount()
  const { disconnect } = useDisconnect()
  const { reloadNonce, triggerReload } = useReload()

  const [profileName, setProfileName] = useState('')
  const [editNameOpen, setEditNameOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  // Danh sách contract của user (backend trả về dựa trên field trong DB)
  const [userEventContracts, setUserEventContracts] = useState<`0x${string}`[]>([])
  const [contractTokenIdsMap, setContractTokenIdsMap] = useState<Record<string, bigint[]>>({})
  const [contractsLoading, setContractsLoading] = useState(false)
  const [contractsError, setContractsError] = useState<string | null>(null)
  // Map (contract:tokenId) -> eventId để gọi issue ticket
  const [eventIdByContractTokenId, setEventIdByContractTokenId] = useState<Record<string, string>>({})
  const [seatByContractTokenId, setSeatByContractTokenId] = useState<Record<string, string[]>>({})
  const [displayByContract, setDisplayByContract] = useState<
    Record<string, { title?: string; date?: string; location?: string }>
  >({})

  useEffect(() => {
    if (!isConnected || !address) {
      setUserEventContracts([])
      setContractsError(null)
      setContractsLoading(false)
      setEventIdByContractTokenId({})
      setContractTokenIdsMap({})
      setSeatByContractTokenId({})
      return
    }

    // Không có auth_token: vẫn cho xem vé on-chain (quét từ /getAllEvent),
    // chỉ thiếu purchase/seat và các tính năng cần xác thực.
    if (!getAuthToken()) {
      let cancelled = false
      async function loadPublicContracts() {
        setContractsLoading(true)
        setContractsError(null)
        setEventIdByContractTokenId({})
        setContractTokenIdsMap({})
        setSeatByContractTokenId({})
        try {
          const eventsJson: any = await apiFetch('/getAllEvent', { method: 'GET', skipAuth: true })
          const events = Array.isArray(eventsJson?.events) ? eventsJson.events : Array.isArray(eventsJson) ? eventsJson : []
          // Chỉ lấy contractAddress có trong hệ thống (từ backend /getAllEvent)
          const merged = events
            .map((ev: any) => ev?.contract?.address)
            .map((x: string) => x.trim())
            .filter((x: string) => isHexAddress(x)) as `0x${string}`[]
          const uniq = Array.from(new Set(merged.map((x: string) => x.toLowerCase())))
            .map((lower: string) => merged.find((x: string) => x.toLowerCase() === lower)!)
            .filter(Boolean)

          // Build map từ events để nút "Tạo QR Check-in" có thể hoạt động sau khi sign-in (hoặc khi backend cho public).
          const fallbackFromEvents: Record<string, string> = {}
          for (const ev of events) {
            const addr = ev?.contract?.address
            const eventId = ev?.id
            const tokenId = ev?.tokenId
            if (typeof addr === 'string' && typeof eventId === 'string') {
              const tid = tokenId != null ? String(tokenId) : '1'
              fallbackFromEvents[`${addr.toLowerCase()}:${tid}`] = eventId
            }
          }

          if (!cancelled) {
            setUserEventContracts(uniq)
            setEventIdByContractTokenId(fallbackFromEvents)
            setContractsLoading(false)
            setContractsError(
              uniq.length === 0 ? 'Không tìm thấy contract sự kiện nào để quét vé.' : 'Bạn chưa đăng nhập (ký message) nên sẽ không hiện số ghế/purchase.',
            )
          }
        } catch {
          if (!cancelled) {
            setUserEventContracts([])
            setContractsLoading(false)
            setContractsError('Không tải được danh sách sự kiện để quét vé. Vui lòng thử lại.')
          }
        }
      }
      void loadPublicContracts()
      return () => {
        cancelled = true
      }
    }

    let cancelled = false

    async function loadContracts() {
      setContractsLoading(true)
      setContractsError(null)

      // Chỉ dùng /me – purchases của user đã mua vé
          const candidates = ['/me']

      for (const path of candidates) {
        try {
          const json: any = await apiFetch(path, { method: 'GET' })
          

          const backendName =
            typeof json?.user?.name === 'string' && json.user.name.trim()
              ? json.user.name.trim()
              : ''
          setProfileName((prev) => (prev || backendName ? prev || backendName : ''))
          const latestNotice = json?.latestCheckinNotice
          if (latestNotice && typeof latestNotice === 'object') {
            const ticketId = typeof latestNotice.ticketId === 'string' ? latestNotice.ticketId : undefined

            if (ticketId) {
              const seenTicketId = localStorage.getItem('last_seen_checkedin_ticket_id')
              if (seenTicketId !== ticketId && !cancelled) {
                localStorage.setItem('last_seen_checkedin_ticket_id', ticketId)
                // Soft refresh so user sees latest on-chain balance after staff check-in
                setTimeout(() => {
                  if (!cancelled) triggerReload()
                }, 800)
              }
            }
          }

          // user.purchases[].event.contract.address
          const purchases = json?.user?.purchases
          const addressesFromPurchases: string[] = Array.isArray(purchases)
            ? purchases
                .map((p: any) => p?.event?.contract?.address)
                .filter((x: any) => typeof x === 'string')
            : []
          const tokenMapFromPurchases: Record<string, bigint[]> = {}
          if (Array.isArray(purchases)) {
            for (const p of purchases) {
              const addr = typeof p?.event?.contract?.address === 'string' ? p.event.contract.address.toLowerCase() : ''
              if (!addr) continue
              const tidRaw = p?.event?.tokenId
              let tid: bigint | null = null
              if (typeof tidRaw === 'bigint') tid = tidRaw
              else if (typeof tidRaw === 'number' && Number.isFinite(tidRaw)) tid = BigInt(Math.trunc(tidRaw))
              else if (typeof tidRaw === 'string' && /^\d+$/.test(tidRaw)) tid = BigInt(tidRaw)
              if (tid && tid > 0n) {
                const arr = tokenMapFromPurchases[addr] || []
                if (!arr.some((x) => x === tid)) arr.push(tid)
                tokenMapFromPurchases[addr] = arr
              }
            }
          }

          // Map loại vé (contract:tokenId) -> eventId – backend trả sẵn, mỗi loại 1 entry
          const map = json?.eventIdByContractTokenId
          const normalizedMap: Record<string, string> = {}
          if (map && typeof map === 'object' && !Array.isArray(map)) {
            for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
              if (typeof k === 'string' && typeof v === 'string') normalizedMap[k.toLowerCase()] = v
            }
            if (!cancelled) setEventIdByContractTokenId(normalizedMap)
          } else {
            // Fallback: build từ purchases (backend cũ)
            const fallback: Record<string, string> = {}
            if (Array.isArray(purchases)) {
              for (const p of purchases) {
                const addr = p?.event?.contract?.address
                const eventId = p?.event?.id
                const tokenId = p?.event?.tokenId
                if (typeof addr === 'string' && typeof eventId === 'string') {
                  const tid = tokenId != null ? String(tokenId) : '1'
                  fallback[`${addr.toLowerCase()}:${tid}`] = eventId
                }
              }
            }
            if (!cancelled) setEventIdByContractTokenId(fallback)
          }

          const seatMap = json?.seatByContractTokenId
          const normalizedSeatMap: Record<string, string[]> = {}
          if (seatMap && typeof seatMap === 'object' && !Array.isArray(seatMap)) {
            for (const [k, v] of Object.entries(seatMap as Record<string, unknown>)) {
              if (typeof k !== 'string') continue
              if (!Array.isArray(v)) continue
              const seats = v
                .filter((x): x is string => typeof x === 'string')
                .map((x) => x.trim())
                .filter(Boolean)
              normalizedSeatMap[k.toLowerCase()] = Array.from(new Set(seats))
            }
          }
          if (!cancelled) setSeatByContractTokenId(normalizedSeatMap)

          // Chỉ dùng contractAddress có trong hệ thống: từ purchases (đã đi qua backend)
          let merged = [...addressesFromPurchases]
            .map((x: string) => x.trim())
            .filter((x: string) => isHexAddress(x)) as `0x${string}`[]

          let uniq = Array.from(new Set(merged.map((x: string) => x.toLowerCase())))
            .map((lower: string) => merged.find((x: string) => x.toLowerCase() === lower)!)
            .filter(Boolean)

          // Fallback thực tế: nếu /me chưa có purchase (hoặc dữ liệu purchase lệch),
          // quét toàn bộ contracts từ /getAllEvent để vẫn đọc số vé on-chain.
          if (uniq.length === 0) {
            try {
              const eventsJson: any = await apiFetch('/getAllEvent', { method: 'GET' })
              const events = Array.isArray(eventsJson?.events) ? eventsJson.events : []

              const addressesFromEvents: string[] = events
                .map((ev: any) => ev?.contract?.address)
                .filter((x: any) => typeof x === 'string')

              merged = [...merged, ...addressesFromEvents]
                .map((x) => x.trim())
                .filter((x) => isHexAddress(x)) as `0x${string}`[]

              uniq = Array.from(new Set(merged.map((x) => x.toLowerCase())))
                .map((lower) => merged.find((x) => x.toLowerCase() === lower)!)
                .filter(Boolean)

              // Nếu /me không có map, build map từ events để nút "Tạo QR Check-in" vẫn dùng được.
              if (Object.keys(normalizedMap).length === 0) {
                const fallbackFromEvents: Record<string, string> = {}
                for (const ev of events) {
                  const addr = ev?.contract?.address
                  const eventId = ev?.id
                  const tokenId = ev?.tokenId
                  if (typeof addr === 'string' && typeof eventId === 'string') {
                    const tid = tokenId != null ? String(tokenId) : '1'
                    fallbackFromEvents[`${addr.toLowerCase()}:${tid}`] = eventId
                  }
                }
                if (!cancelled) setEventIdByContractTokenId(fallbackFromEvents)
              }
            } catch {
              // keep original empty result
            }
          }

          if (!cancelled) {
            setUserEventContracts(uniq)
            setContractTokenIdsMap(tokenMapFromPurchases)
            setContractsLoading(false)
            setContractsError(uniq.length === 0 ? 'Không tìm thấy contract vé nào của bạn.' : null)
          }
          return
        } catch {
          // try next
        }
      }

      if (!cancelled) {
        setUserEventContracts([])
        setContractTokenIdsMap({})
        setContractsError('Không lấy được purchases từ backend (/me).')
        setSeatByContractTokenId({})
        setContractsLoading(false)
      }
    }

    void loadContracts()
    return () => {
      cancelled = true
    }
  }, [address, isConnected, reloadNonce, triggerReload])

  useEffect(() => {
    let cancelled = false
    async function loadDisplayByContract() {
      if (!isConnected) {
        if (!cancelled) setDisplayByContract({})
        return
      }
      try {
        const raw: any = await apiFetch('/getAllEvent', { method: 'GET', skipAuth: true })
        const arr = Array.isArray(raw?.events) ? raw.events : Array.isArray(raw) ? raw : []
        const map: Record<string, { title?: string; date?: string; location?: string }> = {}
        for (const ev of arr) {
          const addr = typeof ev?.contract?.address === 'string' ? ev.contract.address.toLowerCase() : ''
          if (!addr) continue
          if (!map[addr]) {
            map[addr] = {
              title:
                (typeof ev?.title === 'string' && ev.title) ||
                (typeof ev?.eventTitle === 'string' && ev.eventTitle) ||
                (typeof ev?.name === 'string' ? ev.name : undefined),
              date: typeof ev?.date === 'string' ? ev.date : undefined,
              location: typeof ev?.location === 'string' ? ev.location : undefined,
            }
          }
        }
        if (!cancelled) setDisplayByContract(map)
      } catch {
        if (!cancelled) setDisplayByContract({})
      }
    }
    void loadDisplayByContract()
    return () => {
      cancelled = true
    }
  }, [isConnected, reloadNonce])

  // Poll /me periodically so user account can receive "ticket checked-in" notice.
  useEffect(() => {
    if (!isConnected || !address || !getAuthToken()) return
    const id = window.setInterval(() => {
      triggerReload()
    }, 12000)
    return () => window.clearInterval(id)
  }, [address, isConnected, triggerReload])

  const { data: balance, isLoading: balanceLoading } = useBalance({
    address: address,
    query: {
      enabled: !!address && isConnected,
    },
  })


  // Format address để hiển thị
  const formatAddress = (addr: string | undefined) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Format balance
  const formatBalance = () => {
    if (!isConnected || !address) return '0.00'
    if (balanceLoading) return 'Loading...'
    if (!balance) return '0.00'
    
    const ethBalance = parseFloat(formatEther(balance.value))
    return ethBalance.toFixed(4)
  }

  // ====== Load vé thật từ blockchain ======
  const contractList = useMemo(() => userEventContracts.filter((x) => isHexAddress(x)), [userEventContracts])
  const tokenIdsToScanByContract = useMemo(() => {
    const out: Record<string, bigint[]> = {}
    for (const c of contractList) {
      const key = c.toLowerCase()
      const fromPurchase = contractTokenIdsMap[key] || []
      const merged = [...DEFAULT_TOKEN_IDS_TO_SCAN, ...fromPurchase]
      const uniq: bigint[] = []
      for (const tid of merged) {
        if (tid <= 0n) continue
        if (!uniq.some((x) => x === tid)) uniq.push(tid)
      }
      uniq.sort((a, b) => (a < b ? -1 : 1))
      out[key] = uniq
    }
    return out
  }, [contractList, contractTokenIdsMap])
  const balanceScanPairs = useMemo(
    () =>
      contractList.flatMap((contract) =>
        (tokenIdsToScanByContract[contract.toLowerCase()] || DEFAULT_TOKEN_IDS_TO_SCAN).map((tokenId) => ({
          contract,
          tokenId,
        })),
      ),
    [contractList, tokenIdsToScanByContract],
  )

  // 1) Quét balanceOf(user, tokenId) cho TỪNG contract của user
  const balanceReads = useReadContracts({
    contracts:
      address && isConnected
        ? balanceScanPairs.map((p) => ({
            address: p.contract,
            abi: ticket1155Abi,
            functionName: 'balanceOf',
            args: [address, p.tokenId],
          }))
        : [],
    query: { enabled: !!address && isConnected && contractList.length > 0 },
  })

  // 2) Lọc (contract, tokenId) user đang sở hữu (balance > 0)
  const ownedPairs = useMemo(() => {
    const data = balanceReads.data
    if (!data || data.length === 0) return [] as { contract: `0x${string}`; tokenId: bigint }[]

    const owned: { contract: `0x${string}`; tokenId: bigint }[] = []
    for (let i = 0; i < balanceScanPairs.length; i++) {
      const pair = balanceScanPairs[i]
      const result = data[i]?.result
      const bal = typeof result === 'bigint' ? result : 0n
      if (bal > 0n) owned.push({ contract: pair.contract, tokenId: pair.tokenId })
    }
    return owned
  }, [balanceReads.data, balanceScanPairs])

  // 3) Với các (contract, tokenId) đang sở hữu, load thêm metadata on-chain (tên vé, trạng thái, giá, uri)
  const ticketInfoReads = useReadContracts({
    contracts:
      ownedPairs.length > 0
        ? ownedPairs.flatMap((p) => [
            {
              address: p.contract,
              abi: ticket1155Abi,
              functionName: 'getTicketType',
              args: [p.tokenId],
            },
            {
              address: p.contract,
              abi: ticket1155Abi,
              functionName: 'ticketPrices',
              args: [p.tokenId],
            },
            {
              address: p.contract,
              abi: ticket1155Abi,
              functionName: 'uri',
              args: [p.tokenId],
            },
          ])
        : [],
    query: { enabled: !!address && isConnected && ownedPairs.length > 0 },
  })

  // 4) Build list "My Tickets" từ dữ liệu hook
  const myTickets: MyOnchainTicket[] = useMemo(() => {
    if (!address || !isConnected) return []

    const balances = balanceReads.data
    if (!balances || balances.length === 0) return []

    // ticketInfoReads.data layout: [getTicketType(id1), price(id1), uri(id1), getTicketType(id2), ...]
    const info = ticketInfoReads.data || []

    const list: MyOnchainTicket[] = []
    for (let i = 0; i < ownedPairs.length; i++) {
      const p = ownedPairs[i]
      const idx = balanceScanPairs.findIndex((x) => x.contract === p.contract && x.tokenId === p.tokenId)
      const quantityRaw = idx >= 0 ? balances[idx]?.result : 0n
      const quantity = typeof quantityRaw === 'bigint' ? quantityRaw : 0n
      if (quantity <= 0n) continue

      const base = i * 3
      const ticketTypeResult = info[base]?.result as
        | readonly [string, bigint, bigint, boolean, bigint]
        | undefined
      const priceWei = info[base + 1]?.result as bigint | undefined
      const uri = info[base + 2]?.result as string | undefined

      const name = ticketTypeResult?.[0] || `Ticket`
      const isActive = ticketTypeResult?.[3]

      list.push({
        contract: p.contract,
        tokenId: p.tokenId,
        name,
        quantity,
        priceWei,
        uri,
        status: isActive === false ? 'inactive' : 'active',
      })
    }

    // Sort theo tokenId tăng dần cho dễ nhìn
    list.sort((a, b) => (a.tokenId < b.tokenId ? -1 : 1))
    return list
  }, [
    address,
    isConnected,
    balanceReads.data,
    ownedPairs,
    ticketInfoReads.data,
    balanceScanPairs,
  ])

  const totalQuantity = useMemo(() => {
    return myTickets.reduce((sum, t) => sum + t.quantity, 0n)
  }, [myTickets])

  const myTicketCards = useMemo(() => {
    const cards: Array<{ key: string; ticket: MyOnchainTicket; seat?: string; order: number }> = []
    for (const ticket of myTickets) {
      const count = ticket.quantity > 200n ? 200 : Number(ticket.quantity)
      const seatKey = `${ticket.contract.toLowerCase()}:${ticket.tokenId.toString()}`
      const seats = seatByContractTokenId[seatKey] || []
      for (let i = 0; i < count; i++) {
        cards.push({
          key: `${ticket.contract}:${ticket.tokenId.toString()}:${i}`,
          ticket,
          seat: seats[i],
          order: i + 1,
        })
      }
    }
    return cards
  }, [myTickets, seatByContractTokenId])

  // 5) Off-chain metadata (tên/mô tả/ảnh) từ uri(tokenId)
  const [metadataByTokenId, setMetadataByTokenId] = useState<Record<string, TokenMetadata>>({})

  // QR modal state
  const [qrOpen, setQrOpen] = useState(false)
  const [qrTitle, setQrTitle] = useState<string>('')
  const [qrPayload, setQrPayload] = useState<string>('')
  const [qrIssueLoading, setQrIssueLoading] = useState(false)
  const [qrIssueError, setQrIssueError] = useState<string | null>(null)
  const [qrCopied, setQrCopied] = useState(false)

  const handleReloadAll = () => {
    // Reload backend-driven contracts (/me) + refetch on-chain reads + refetch metadata
    triggerReload()
    setMetadataByTokenId({})
    void balanceReads.refetch?.()
    void ticketInfoReads.refetch?.()
  }

  const ticketsWithUri = useMemo(
    () =>
      myTickets
        .filter((t) => !!t.uri)
        .map((t) => ({ contract: t.contract, tokenId: t.tokenId, uri: String(t.uri) })),
    [myTickets],
  )

  const openQrForTicket = async (ticket: MyOnchainTicket) => {
    const tokenIdKey = ticket.tokenId.toString()
    const md = metadataByTokenId[`${ticket.contract}:${tokenIdKey}`]
    const label = md?.ticketType || md?.type || guessTicketTypeLabel(ticket.tokenId)

    // Key format: contract:tokenId (backend trả về đúng loại vé theo tokenId)
    const key = `${ticket.contract.toLowerCase()}:${tokenIdKey}`

    const eventId = eventIdByContractTokenId[key]
    setQrIssueLoading(true)
    setQrIssueError(null)
    setQrTitle((md?.event?.title || md?.name || ticket.name) + (label ? ` • ${label}` : ''))
    setQrOpen(true)
    setQrPayload('')

    try {
      const payload =
        eventId
          ? { eventId, amount: 1 }
          : {
              contractAddress: ticket.contract,
              tokenId: tokenIdKey,
              amount: 1,
            }
      const res = await issueTicket(payload)
      setQrPayload(res.qr.text)
      setQrIssueError(null)
    } catch (e) {
      setQrIssueError(e instanceof Error ? e.message : 'Không thể tạo QR. Vui lòng thử lại.')
      setQrPayload('')
    } finally {
      setQrIssueLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function fetchOneByKey(contract: `0x${string}`, tokenId: bigint, rawUri: string) {
      const tokenKey = `${contract}:${tokenId.toString()}`
      if (metadataByTokenId[tokenKey]) return

      const uri = normalizeIpfsUri(rawUri)
      const candidates = uri.endsWith('.json') ? [uri] : [uri, `${uri}.json`]

      for (const url of candidates) {
        try {
          const res = await fetch(url, { method: 'GET' })
          if (!res.ok) continue
          const json = (await res.json()) as unknown
          if (!json || typeof json !== 'object') continue

          const obj = json as Record<string, unknown>
          const name = safeString(obj.name)
          const description = safeString(obj.description)
          const imageRaw = safeString(obj.image)
          const image = imageRaw ? normalizeIpfsUri(imageRaw) : undefined
          const ticketType = safeString(obj.ticketType)
          const type = safeString(obj.type)

          const eventRaw = obj.event
          const eventObj = eventRaw && typeof eventRaw === 'object' ? (eventRaw as Record<string, unknown>) : undefined
          const event = eventObj
            ? {
                title: safeString(eventObj.title),
                date: safeString(eventObj.date),
                time: safeString(eventObj.time),
                location: safeString(eventObj.location),
                organizer: safeString(eventObj.organizer),
              }
            : undefined

          if (cancelled) return
          setMetadataByTokenId((prev) => ({
            ...prev,
            [tokenKey]: { name, description, image, ticketType, type, event },
          }))
          return
        } catch {
          // ignore
        }
      }
    }

    void (async () => {
      for (const t of ticketsWithUri) {
        // eslint-disable-next-line no-await-in-loop
        await fetchOneByKey(t.contract, t.tokenId, t.uri)
        if (cancelled) return
      }
    })()

    return () => {
      cancelled = true
    }
    // metadataByTokenId is intentionally excluded to avoid refetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsWithUri])

  const handleDisconnect = () => {
    disconnect()
    navigate('/')
  }

  const handleSaveName = async () => {
    const trimmed = editName.trim()
    // Nếu để nguyên hoặc rỗng: không gọi API, chỉ đóng dialog
    if (!trimmed || trimmed === profileName.trim()) {
      setEditNameOpen(false)
      setNameError(null)
      return
    }
    setSavingName(true)
    setNameError(null)
    try {
      const res: any = await apiFetch('/me/name', {
        method: 'PATCH',
        body: { name: trimmed },
      })
      const serverName =
        typeof res?.user?.name === 'string' && res.user.name.trim()
          ? res.user.name.trim()
          : trimmed
      setProfileName(serverName)
      setEditNameOpen(false)
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Không lưu được tên. Vui lòng thử lại.')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-[#1e3a5f]/60 via-[#3d2817]/60 to-[#1e3a5f]/60" style={{ fontFamily: "'Lora', serif" }}>
      <Header />
      
      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-8 sm:py-12 md:py-16">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#f4d03f] drop-shadow-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
              Hồ Sơ Của Tôi
            </h1>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#5c4033]/60 hover:bg-[#5c4033]/80 border border-[#5c4033]/50 hover:border-[#d4af37]/50 rounded-lg text-sm sm:text-base text-[#e8e0d0] hover:text-[#f4d03f] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#f4d03f]/50"
              aria-label="Quay lại trang chủ"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Quay lại</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 sm:space-y-8">
          {/* Contracts loaded from backend */}
          <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-[#5c4033]/50">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-[#f4d03f] drop-shadow-md" style={{ fontFamily: "'Playfair Display', serif" }}>
                Contract sự kiện mà bạn đã mua
              </h2>
              <button
                type="button"
                onClick={handleReloadAll}
                disabled={contractsLoading}
                className="px-3 py-2 rounded-xl border border-[#d4af37]/40 bg-[#3d2817]/30 text-[#f4d03f] hover:bg-[#3d2817]/50 hover:text-[#f5f1e8] transition-colors duration-200 text-xs sm:text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {contractsLoading ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>
            {contractsError && <div className="mt-2 text-xs text-[#fbbf24]">{contractsError}</div>}
            {contractList.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {contractList.map((c) => (
                  <span
                    key={c}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-[#5c4033]/40 text-[#e8e0d0] border border-[#5c4033]/60 font-mono"
                  >
                    {shortAddress(c)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Wallet Info */}
          {isConnected && address ? (
            <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-[#5c4033]/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-[#f4d03f] drop-shadow-md" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Thông Tin Ví
                </h2>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#d97706]/20 hover:bg-[#d97706]/30 border border-[#d97706]/50 hover:border-[#d97706] rounded-lg text-xs sm:text-sm font-medium text-[#d97706] hover:text-[#f4d03f] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#d97706]/50"
                  aria-label="Disconnect wallet"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Thoát Ví</span>
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-sm sm:text-base text-[#e8e0d0]">Tên hiển thị:</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-semibold text-[#f4d03f]">
                      {profileName || '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditName(profileName)
                        setEditNameOpen(true)
                        setNameError(null)
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#d4af37]/60 bg-[#3d2817]/40 text-[#f4d03f] text-xs sm:text-sm font-semibold hover:bg-[#3d2817]/70"
                    >
                      Sửa tên
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm sm:text-base text-[#e8e0d0]">Địa chỉ:</span>
                  <span className="text-sm sm:text-base font-mono text-[#f4d03f]">{formatAddress(address)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm sm:text-base text-[#e8e0d0]">Số dư:</span>
                  <span className="text-sm sm:text-base font-mono text-[#f4d03f]">{formatBalance()} ETH</span>
                </div>
              </div>
            </div>
          ) : isReconnecting ? (
            <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-[#5c4033]/50 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-4 border-[#f4d03f]/30 border-t-[#f4d03f] animate-spin" />
                <p className="text-sm sm:text-base text-[#e8e0d0]">Đang kết nối lại ví...</p>
                <p className="text-xs text-[#e8e0d0]/70">Vui lòng đợi (Edge/trình duyệt có thể mất vài giây)</p>
              </div>
            </div>
          ) : (
            <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-[#5c4033]/50 text-center">
              <p className="text-sm sm:text-base text-[#e8e0d0] mb-4">Vui lòng kết nối ví để xem thông tin</p>
              <div className="flex justify-center">
                <ConnectButton chainStatus="none" showBalance={false} />
              </div>
            </div>
          )}

          {/* Statistics */}
          {isConnected && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-[#5c4033]/50 text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#f4d03f] mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {totalQuantity.toString()}
                </div>
                <div className="text-xs sm:text-sm text-[#e8e0d0]">Tổng số vé </div>
              </div>
              <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-[#5c4033]/50 text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#f4d03f] mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {myTickets.length}
                </div>
                <div className="text-xs sm:text-sm text-[#e8e0d0]">Số loại vé</div>
              </div>
              <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-[#5c4033]/50 text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#f4d03f] mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {balanceReads.isLoading || ticketInfoReads.isLoading ? '...' : '✓'}
                </div>
                <div className="text-xs sm:text-sm text-[#e8e0d0]">Trạng thái load</div>
              </div>
            </div>
          )}

          {/* My Tickets */}
          {isConnected && (
            <div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[#f4d03f] mb-4 sm:mb-6 drop-shadow-md" style={{ fontFamily: "'Playfair Display', serif" }}>
                Vé Của Tôi
              </h2>
              <div className="space-y-3 sm:space-y-4">
                {myTicketCards.length > 0 ? (
                 
                  myTicketCards.map((card) => {
                    const ticket = card.ticket
                    return (
                    <div
                      key={card.key}
                      className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-[#5c4033]/50 hover:border-[#d4af37]/50 transition-all duration-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        <div className="flex-1">
                          
                          <h3 className="text-base sm:text-lg md:text-xl font-bold text-[#f4d03f] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                            {displayByContract[ticket.contract.toLowerCase()]?.title ||
                              metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.title ||
                              metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.name ||
                              ticket.name}
                          </h3>
                          {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event && (
                            <div className="text-xs sm:text-sm text-[#e8e0d0] mb-2 space-y-1">
                              {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[#f4d03f]">📅</span>
                                  <span>
                                    {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.date}
                                    {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.time
                                      ? ` • ${metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.time}`
                                      : ''}
                                  </span>
                                </div>
                              )}
                              {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.location && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[#f4d03f]">📍</span>
                                  <span>{metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.location}</span>
                                </div>
                              )}
                              {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.organizer && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[#f4d03f]">👤</span>
                                  <span>{metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.event?.organizer}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.description && (
                            <p className="text-xs sm:text-sm text-[#e8e0d0] mb-2 line-clamp-3">
                              {metadataByTokenId[`${ticket.contract}:${ticket.tokenId.toString()}`]?.description}
                            </p>
                          )}
                          <div className="space-y-1 text-xs sm:text-sm text-[#e8e0d0]">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-[#f4d03f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span>Vé #{card.order}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-[#f4d03f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>
                                Giá:{' '}
                                {typeof ticket.priceWei === 'bigint' ? `${formatEther(ticket.priceWei)} ETH` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-[#f4d03f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 01.553-.894L9 2m0 18l6-3m-6 3V2m6 15l6 3m-6-3V2m6 18V8m0 0l-6-3m6 3l-6 3" />
                              </svg>
                              <span>
                                Ghế: {card.seat || 'Chưa gán'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {(() => {
                            const key = `${ticket.contract}:${ticket.tokenId.toString()}`
                            const label =
                              metadataByTokenId[key]?.ticketType ||
                              metadataByTokenId[key]?.type ||
                              guessTicketTypeLabel(ticket.tokenId)
                            return (
                              <span className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-medium ${ticketTypeBadgeClass(label)}`}>
                                {label}
                              </span>
                            )
                          })()}
                          <span
                            className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-medium ${
                              ticket.status === 'active'
                                ? 'bg-[#4a9b8e]/30 text-[#4a9b8e] border border-[#4a9b8e]/50'
                                : 'bg-[#d97706]/30 text-[#d97706] border border-[#d97706]/50'
                            }`}
                          >
                            {ticket.status === 'active' ? 'Đang bán' : 'Tạm dừng'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void openQrForTicket(ticket)}
                            disabled={qrIssueLoading}
                            className="px-3 py-1.5 bg-linear-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] rounded-lg text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {qrIssueLoading ? 'Đang tạo...' : 'Tạo QR Check-in'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )})
                ) : (
                  <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-xl p-6 border border-[#5c4033]/50 text-center">
                    <p className="text-sm sm:text-base text-[#e8e0d0]">
                      {balanceReads.isLoading
                        ? 'Đang tải vé từ blockchain...'
                        : 'Bạn chưa có vé nào trên contract này (hoặc tokenId nằm ngoài dải quét).'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* QR Modal */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Generate QR"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#3d2817] border border-[#5c4033]/60 p-4 sm:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#f4d03f]" style={{ fontFamily: "'Playfair Display', serif" }}>
                  QR Vé
                </h3>
                {qrTitle && <div className="text-xs sm:text-sm text-[#e8e0d0] mt-1">{qrTitle}</div>}
              </div>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#5c4033]/60 hover:bg-[#5c4033]/80 text-[#e8e0d0] border border-[#5c4033]/60"
              >
                Đóng
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center">
              {qrIssueLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full border-4 border-[#f4d03f]/30 border-t-[#f4d03f] animate-spin" />
                  <div className="text-sm text-[#e8e0d0]">Đang tạo QR có chữ ký...</div>
                </div>
              ) : qrIssueError ? (
                <div className="text-sm text-[#f87171]">{qrIssueError}</div>
              ) : qrPayload ? (
                <div className="rounded-xl border border-[#5c4033]/60 bg-white p-2 inline-block">
                  <QRCodeSVG value={qrPayload} size={200} level="M" />
                </div>
              ) : null}
            </div>

            <div className="mt-4 text-xs text-[#e8e0d0]/80">
              QR có chữ ký HMAC, TTL 24h. Staff quét bằng trang Check-in Scanner để xác thực on-chain.
              {qrPayload && (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[#e8e0d0]/60">Payload (nhập thủ công nếu quét lỗi)</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(qrPayload)
                          setQrCopied(true)
                          setTimeout(() => setQrCopied(false), 2000)
                        } catch {
                          setQrIssueError('Không thể sao chép')
                        }
                      }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#5c4033]/60 hover:bg-[#5c4033]/80 border border-[#5c4033]/60 text-[#f4d03f] text-xs font-medium transition-colors shrink-0"
                      title="Sao chép để nhập thủ công nếu quét lỗi"
                    >
                      {qrCopied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Đã sao chép
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Sao chép
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/20 border border-[#5c4033]/60 p-3">
                    {qrPayload}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Edit name dialog */}
      {editNameOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!savingName) setEditNameOpen(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#3d2817] border border-[#5c4033]/60 p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[#f4d03f] mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
              Đổi tên hiển thị
            </h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#5c4033]/60 bg-black/30 text-[#f5f1e8] text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50"
              placeholder="Nhập tên mới"
            />
            {nameError && (
              <div className="mt-1 text-xs text-[#fecaca]">{nameError}</div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!savingName) setEditNameOpen(false)
                }}
                className="px-3 py-1.5 rounded-lg border border-[#5c4033]/60 bg-[#3d2817]/40 text-[#e8e0d0] text-xs sm:text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleSaveName()}
                disabled={savingName}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] text-xs sm:text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {savingName ? 'Đang lưu...' : 'Thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Profile
