import { useEffect, useMemo, useRef, useState } from 'react'
import { formatEther } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { ticket1155Abi } from '../abi/ticket1155Abi'
import { apiFetch } from '../api/http'
import { getTakenSeats } from '../api/tickets'

type Props = {
  /** Địa chỉ contract event (Ticket1155) – truyền động từ EventDetail/Home */
  contractAddress: `0x${string}`
  /** Mặc định loại vé (tokenId) */
  defaultTokenId?: bigint
  /**
   * Backend tokenId is used as "how many ticket types exist".
   * Example: tokenId=3 => options 1..3 (Thường/VIP/VVIP)
   */
  ticketTypeCount?: bigint
  /** Ẩn/hiện lựa chọn loại vé */
  showTicketTypeSelector?: boolean
  /** Callback khi mua xong (sau receipt) */
  onPurchased?: () => void
  /** Render inside another card (no outer card/title) */
  embedded?: boolean
}

function isHexAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v)
}

const BUY_FLOW_STORAGE_KEY = 'buy_ticket_flow_v1'

type SetPurchaseResp = {
  ok?: boolean
  purchase?: {
    seat?: string | null
    seatSaved?: boolean
    seatSkippedReason?: string | null
  }
}

export default function BuyTicket({
  contractAddress,
  defaultTokenId = 1n,
  ticketTypeCount,
  showTicketTypeSelector = true,
  onPurchased,
  embedded = false,
}: Props) {
  const { address, isConnected, chainId: chainIdFromAccount } = useAccount()
  const publicClient = usePublicClient()
  const chainId = chainIdFromAccount ?? 11155111
  const { writeContractAsync, isPending, error } = useWriteContract()

  const [tokenIdInput, setTokenIdInput] = useState<string>(defaultTokenId.toString())
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [purchaseSaveError, setPurchaseSaveError] = useState<string | null>(null)
  const [isSavingPurchase, setIsSavingPurchase] = useState(false)
  const [purchaseSaved, setPurchaseSaved] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  const [flowStage, setFlowStage] = useState<'idle' | 'signing' | 'confirming' | 'saving' | 'success' | 'failed'>(
    'idle',
  )
  const [flowMessage, setFlowMessage] = useState('')
  const [seatCode, setSeatCode] = useState('')
  const [takenSeats, setTakenSeats] = useState<string[]>([])
  const [seatError, setSeatError] = useState<string | null>(null)
  const [seatLoading, setSeatLoading] = useState(false)
  const [seatReloadKey, setSeatReloadKey] = useState(0)
  const mountedRef = useRef(true)
  const savingOnceRef = useRef(false)

  function persistFlow(next: {
    stage: 'idle' | 'signing' | 'confirming' | 'saving' | 'success' | 'failed'
    message?: string
    txHash?: string | null
    seatCode?: string
    chainId?: number
    contractAddress?: string
    tokenId?: string
    ownerWallet?: string
    createdAt?: string
  }) {
    try {
      const payload = {
        stage: next.stage,
        message: next.message || '',
        txHash: next.txHash ?? null,
        seatCode: next.seatCode ?? '',
        chainId: next.chainId ?? chainId,
        contractAddress: (next.contractAddress ?? contractAddress) as string,
        tokenId: next.tokenId ?? tokenId?.toString() ?? '',
        ownerWallet: next.ownerWallet ?? address ?? '',
        createdAt: next.createdAt ?? new Date().toISOString(),
      }
      sessionStorage.setItem(BUY_FLOW_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }

  function clearPersistedFlow() {
    try {
      sessionStorage.removeItem(BUY_FLOW_STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  async function savePurchaseToBackend(params: {
    chainId: number
    contractAddress: `0x${string}`
    tokenId: string
    seat: string
    ownerWallet: `0x${string}`
  }) {
    if (savingOnceRef.current) return
    savingOnceRef.current = true
    const payload = { chainId: params.chainId, contractAddress: params.contractAddress, tokenId: params.tokenId, quantity: 1 }
    const payloadWithSeat = { ...payload, seat: params.seat.trim(), ownerWallet: params.ownerWallet }
    let saved: SetPurchaseResp | null = null
    let lastErr: unknown = null
    const endpoints = ['/setpurchase', '/setpurchase/public']
    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        saved = await apiFetch<SetPurchaseResp>(endpoints[attempt], { method: 'POST', body: payloadWithSeat })
        break
      } catch (e) {
        lastErr = e
        // If backend says seat taken, stop retrying and ask user to pick another seat.
        if (e instanceof Error && String(e.message).toUpperCase().includes('SEAT_TAKEN')) {
          throw new Error('Ghế này vừa có người chọn trước. Vui lòng chọn ghế khác.')
        }
        if (attempt < endpoints.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 250))
        }
      }
    }
    if (!saved) {
      throw (lastErr instanceof Error ? lastErr : new Error('Lưu purchase thất bại'))
    }
    const seatSaved = saved?.purchase?.seatSaved === true
    if (!seatSaved) {
      const reason = saved?.purchase?.seatSkippedReason
      if (reason === 'SEAT_FEATURE_NOT_READY') {
        throw new Error('Seat chưa sẵn sàng trên backend. Vui lòng thử lại sau.')
      }
      throw new Error('Không lưu được số ghế. Vui lòng chọn lại và mua lại.')
    }
    return saved
  }

  // Resume flow after remount (if a tx was confirmed but UI got unmounted).
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    async function resumeIfNeeded() {
      try {
        const raw = sessionStorage.getItem(BUY_FLOW_STORAGE_KEY)
        if (!raw) return
        const obj = JSON.parse(raw) as any
        if (!obj || typeof obj !== 'object') return
        const stage = String(obj.stage || '')
        const txHash = typeof obj.txHash === 'string' ? (obj.txHash as `0x${string}`) : null
        const storedContract = typeof obj.contractAddress === 'string' ? obj.contractAddress : ''
        const storedTokenId = typeof obj.tokenId === 'string' ? obj.tokenId : ''
        const storedSeat = typeof obj.seatCode === 'string' ? obj.seatCode : ''
        const storedOwner = typeof obj.ownerWallet === 'string' ? obj.ownerWallet : ''
        const storedChainId = typeof obj.chainId === 'number' ? obj.chainId : chainId

        if (!txHash || !storedContract || !storedTokenId || !storedSeat || !storedOwner) return
        if (storedContract.toLowerCase() !== contractAddress.toLowerCase()) return
        if (!publicClient) return

        if (stage === 'confirming' || stage === 'saving') {
          setFlowOpen(true)
          setFlowStage(stage === 'saving' ? 'saving' : 'confirming')
          setFlowMessage(stage === 'saving' ? 'Đang xử lý giao dịch...' : 'Đang chờ blockchain xác nhận...')
          setTxHash(txHash)
          try {
            if (stage === 'confirming') {
              setIsConfirming(true)
              const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
              setIsConfirming(false)
              if (receipt.status !== 'success') throw new Error('Giao dịch thất bại trên blockchain.')
            }

            setIsSavingPurchase(true)
            setFlowStage('saving')
            persistFlow({
              stage: 'saving',
              message: 'Đã xác nhận. Đang xử lý giao dịch...',
              txHash,
              seatCode: storedSeat,
              chainId: storedChainId,
              contractAddress: storedContract,
              tokenId: storedTokenId,
              ownerWallet: storedOwner,
            })
            await savePurchaseToBackend({
              chainId: storedChainId,
              contractAddress: storedContract as `0x${string}`,
              tokenId: storedTokenId,
              seat: storedSeat,
              ownerWallet: storedOwner as `0x${string}`,
            })
            setIsSavingPurchase(false)
            setPurchaseSaved(true)
            setSeatReloadKey((v) => v + 1)
            setFlowStage('success')
            setFlowMessage('Mua vé thành công. Ghế đã được ghi nhận!')
            clearPersistedFlow()
          } catch (e) {
            setIsConfirming(false)
            setIsSavingPurchase(false)
            const msg = e instanceof Error ? e.message : String(e)
            setPurchaseSaveError(msg)
            setFlowStage('failed')
            setFlowMessage(msg || 'Mua vé thất bại. Vui lòng thử lại.')
            if (String(msg).includes('Ghế này')) {
              setSeatReloadKey((v) => v + 1)
            }
            persistFlow({ stage: 'failed', message: msg, txHash })
          }
        }
      } catch {
        // ignore
      }
    }
    void resumeIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, contractAddress, chainId])

  const tokenIdOptions = useMemo(() => {
    if (!showTicketTypeSelector) return [] as bigint[]
    if (ticketTypeCount === undefined) return [] as bigint[]
    if (ticketTypeCount < 1n) return [] as bigint[]
    const capped = ticketTypeCount > 20n ? 20n : ticketTypeCount // avoid rendering huge lists
    return Array.from({ length: Number(capped) }, (_, i) => BigInt(i + 1))
  }, [ticketTypeCount, showTicketTypeSelector])

  function ticketLabelByTokenId(tid: bigint) {
    if (tid === 1n) return 'Thường'
    if (tid === 2n) return 'VIP'
    if (tid === 3n) return 'VVIP'
    return `Vé số ${tid.toString()}`
  }

  // Nếu không cho chọn loại vé, khóa cứng tokenId theo defaultTokenId (vd: vé số 1)
  const tokenId = useMemo(() => {
    if (!showTicketTypeSelector) return defaultTokenId
    const v = tokenIdInput.trim()
    if (!/^\d+$/.test(v)) return undefined
    try {
      return BigInt(v)
    } catch {
      return undefined
    }
  }, [defaultTokenId, showTicketTypeSelector, tokenIdInput])

  const isValidContract = isHexAddress(contractAddress)
  // Read-only contract data (price, ticket type) should work even before wallet connect.
  const canQuery = isValidContract && tokenId !== undefined

  const { data: priceWei, isLoading: priceLoading } = useReadContract({
    address: contractAddress,
    abi: ticket1155Abi,
    functionName: 'ticketPrices',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: canQuery },
  })
  const { data: ticketTypeInfo } = useReadContract({
    address: contractAddress,
    abi: ticket1155Abi,
    functionName: 'getTicketType',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: canQuery },
  })

  const unitPrice = typeof priceWei === 'bigint' ? priceWei : undefined
  const totalPrice = unitPrice // vì mỗi lần chỉ mua 1 vé
  const maxSupplyRaw = (ticketTypeInfo as any)?.[1]
  const maxSeatCount = typeof maxSupplyRaw === 'bigint' && maxSupplyRaw > 0n
    ? Number(maxSupplyRaw > 500n ? 500n : maxSupplyRaw)
    : 200
  const seatOptions = useMemo(() => {
    if (maxSeatCount <= 0) return [] as string[]
    return Array.from({ length: maxSeatCount }, (_, i) => String(i + 1))
  }, [maxSeatCount])
  const takenSeatSet = useMemo(
    () => new Set(takenSeats.map((x) => x.trim().toUpperCase())),
    [takenSeats],
  )
  const selectedSeatTaken = seatCode.trim() ? takenSeatSet.has(seatCode.trim().toUpperCase()) : false

  useEffect(() => {
    async function loadTakenSeats() {
      if (!isValidContract || tokenId === undefined) {
        setTakenSeats([])
        setSeatError(null)
        return
      }
      setSeatLoading(true)
      setSeatError(null)
      try {
        const data = await getTakenSeats({
          chainId,
          contractAddress,
          tokenId: tokenId.toString(),
        })
        setTakenSeats(data.takenSeats)
      } catch (e) {
        setTakenSeats([])
        setSeatError(e instanceof Error ? e.message : String(e))
      } finally {
        setSeatLoading(false)
      }
    }
    void loadTakenSeats()
  }, [chainId, contractAddress, isValidContract, tokenId, seatReloadKey])

  useEffect(() => {
    if (seatOptions.length === 0) return
    if (seatCode && !selectedSeatTaken) return
    const firstAvailable = seatOptions.find((s) => !takenSeatSet.has(s.toUpperCase())) || ''
    setSeatCode(firstAvailable)
  }, [seatCode, seatOptions, selectedSeatTaken, takenSeatSet])

  const handleBuy = async () => {
    if (!isConnected || !address) return
    if (!isValidContract) return
    if (tokenId === undefined) return
    if (unitPrice === undefined) return
    if (!seatCode.trim() || selectedSeatTaken) return
    if (!publicClient) {
      setPurchaseSaveError('Không kết nối được public client để xác nhận giao dịch.')
      return
    }
    setPurchaseSaved(false)
    setPurchaseSaveError(null)
    setTxHash(null)
    setIsConfirming(false)
    setIsSavingPurchase(false)
    setFlowOpen(true)
    setFlowStage('signing')
    setFlowMessage('Đang mở ví để ký giao dịch...')
    savingOnceRef.current = false
    persistFlow({
      stage: 'signing',
      message: 'Đang mở ví để ký giao dịch...',
      txHash: null,
      seatCode,
      chainId,
      contractAddress,
      tokenId: tokenId.toString(),
      ownerWallet: address,
    })
    
    try {
      // Ticket1155: buyTicket(uint256 id) => mỗi lần call mua đúng 1 vé
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ticket1155Abi,
        functionName: 'buyTicket',
        args: [tokenId],
        value: unitPrice,
      })
      // Even if UI unmounts/remounts, we still persist flow for resume.
      persistFlow({
        stage: 'confirming',
        message: 'Đã ký. Đang chờ blockchain xác nhận...',
        txHash: hash,
        seatCode,
        chainId,
        contractAddress,
        tokenId: tokenId.toString(),
        ownerWallet: address,
      })
      if (!mountedRef.current) {
        return
      }
      setTxHash(hash)
      setIsConfirming(true)
      setFlowStage('confirming')
      setFlowMessage('Đã ký. Đang chờ blockchain xác nhận...')

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      persistFlow({
        stage: 'saving',
        message: 'Đã xác nhận. Đang xử lý giao dịch...',
        txHash: hash,
        seatCode,
        chainId,
        contractAddress,
        tokenId: tokenId.toString(),
        ownerWallet: address,
      })
      if (!mountedRef.current) return
      setIsConfirming(false)
      if (receipt.status !== 'success') {
        throw new Error('Giao dịch thất bại trên blockchain.')
      }

      // Ensure Profile can always scan this contract on-chain even if DB save fails.
      try {
        const raw = localStorage.getItem('profile_contracts_to_scan') || '[]'
        const arr = Array.isArray(JSON.parse(raw)) ? (JSON.parse(raw) as unknown[]) : []
        const next = Array.from(
          new Set(
            [...arr, contractAddress]
              .filter((x): x is string => typeof x === 'string')
              .map((x) => x.toLowerCase()),
          ),
        )
        localStorage.setItem('profile_contracts_to_scan', JSON.stringify(next))
      } catch {
        // ignore
      }

      setIsSavingPurchase(true)
      setFlowStage('saving')
      setFlowMessage('Đã xác nhận. Đang xử lý giao dịch...')
      const saved = await savePurchaseToBackend({
        chainId,
        contractAddress,
        tokenId: tokenId.toString(),
        seat: seatCode,
        ownerWallet: address,
      })
      if (!mountedRef.current) return
      if (typeof saved?.purchase?.seat === 'string' && saved.purchase.seat.trim()) {
        setSeatCode(saved.purchase.seat.trim())
      }
      setPurchaseSaved(true)
      setSeatReloadKey((v) => v + 1)
      setFlowStage('success')
      setFlowMessage('Mua vé thành công. Ghế đã được ghi nhận!')
      clearPersistedFlow()
      onPurchased?.()
    } catch (e) {
      if (!mountedRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setPurchaseSaveError(msg)
      setFlowStage('failed')
      setFlowMessage(msg || 'Mua vé thất bại. Vui lòng thử lại.')
      if (String(msg).includes('Ghế này')) {
        setSeatReloadKey((v) => v + 1)
      }
      persistFlow({ stage: 'failed', message: msg, txHash })
    } finally {
      if (!mountedRef.current) return
      setIsConfirming(false)
      setIsSavingPurchase(false)
    }
  }

  const busy = flowStage === 'signing' || isPending || isConfirming || isSavingPurchase

  // Do NOT unmount UI during an in-flight transaction.
  // Wagmi can briefly flip `isConnected` during wallet popups/reconnect,
  // and unmounting would "kill" the progress dialog.
  const showDisconnectedOnly = !isConnected && !flowOpen && !busy
  return (
    <div className={embedded ? '' : 'card'} style={embedded ? { padding: 0, background: 'transparent', border: 'none' as any } : undefined}>
      {!embedded && <h2>Mua vé</h2>}

      {showDisconnectedOnly && (
        <p style={{ color: '#888', marginTop: '1rem' }}>Vui lòng kết nối ví để mua vé</p>
      )}

      <div style={{ marginTop: embedded ? 0 : '1rem', textAlign: 'left' }}>
        {!embedded && <h3 style={{ marginBottom: '0.5rem' }}>Thông tin vé</h3>}
        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">Loại vé</div>
            <div className="info-value">
              {showTicketTypeSelector
                ? tokenId !== undefined
                  ? ticketLabelByTokenId(tokenId)
                  : 'N/A'
                : `Vé số ${defaultTokenId.toString()}`}
            </div>
          </div>
          <div className="info-item">
            <div className="info-label">Giá 1 vé</div>
            <div className="info-value">
              {priceLoading ? 'Đang tải...' : unitPrice !== undefined ? `${formatEther(unitPrice)} ETH` : 'N/A'}
            </div>
          </div>
          <div className="info-item">
            <div className="info-label">Tổng tiền</div>
            <div className="info-value">
              {priceLoading ? 'Đang tải...' : totalPrice !== undefined ? `${formatEther(totalPrice)} ETH` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: embedded ? '1rem' : '1.5rem', textAlign: 'left' }}>
        {!embedded && <h3 style={{ marginBottom: '0.5rem' }}>Mua vé</h3>}

        {showTicketTypeSelector && (
          <>
            {tokenIdOptions.length > 0 ? (
              <select
                value={tokenIdInput}
                onChange={(e) => setTokenIdInput(e.target.value)}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  width: '100%',
                }}
              >
                {tokenIdOptions.map((tid) => (
                  <option key={tid.toString()} value={tid.toString()} style={{ color: '#111' }}>
                    {ticketLabelByTokenId(tid)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={0}
                step={1}
                placeholder="Token ID (loại vé)"
                value={tokenIdInput}
                onChange={(e) => setTokenIdInput(e.target.value)}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  width: '100%',
                }}
              />
            )}
          </>
        )}

        <div style={{ marginTop: '0.75rem' }}>
          <select
            value={seatCode}
            onChange={(e) => setSeatCode(e.target.value)}
            disabled={seatLoading || seatOptions.length === 0}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              width: '100%',
              opacity: seatLoading ? 0.7 : 1,
            }}
          >
            <option value="" style={{ color: '#111' }}>
              {seatLoading ? 'Đang tải ghế...' : 'Chọn số ghế'}
            </option>
            {seatOptions.map((s) => {
              const taken = takenSeatSet.has(s.toUpperCase())
              return (
                <option key={s} value={s} disabled={taken} style={{ color: taken ? '#999' : '#111' }}>
                  {taken ? `Ghế ${s} • Đã có người` : `Ghế ${s}`}
                </option>
              )
            })}
          </select>
          {seatError && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#fca5a5' }}>
              Không tải được danh sách ghế: {seatError}
            </div>
          )}
          {!seatError && selectedSeatTaken && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#fca5a5' }}>
              Ghế này đã có người mua, vui lòng chọn ghế khác.
            </div>
          )}
        </div>

        <button
          onClick={() => void handleBuy()}
          disabled={
            !isValidContract ||
            tokenId === undefined ||
            unitPrice === undefined ||
            !seatCode.trim() ||
            selectedSeatTaken ||
            isPending ||
            isConfirming ||
            isSavingPurchase ||
            purchaseSaved
          }
          style={{
            marginTop: showTicketTypeSelector ? '0.75rem' : '0.25rem',
            width: '100%',
            padding: '0.95rem 1rem',
            borderRadius: '12px',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #d4af37 0%, #f4d03f 100%)',
            color: '#3d2817',
            opacity:
              !isValidContract || tokenId === undefined || unitPrice === undefined || isPending || isConfirming || isSavingPurchase || purchaseSaved
              || !seatCode.trim() || selectedSeatTaken
                ? 0.6
                : 1,
          }}
        >
          {isPending
            ? 'Đang ký...'
            : isConfirming
              ? 'Đang chờ xác nhận...'
              : isSavingPurchase
                ? 'Đang lưu purchase...'
                : purchaseSaved
                  ? 'Thành công!'
                : showTicketTypeSelector
                  ? 'Mua vé'
                  : `Mua vé số ${defaultTokenId.toString()}`}
        </button>

        {txHash && <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>Tx: {txHash}</div>}
        {isSavingPurchase && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>Đang lưu purchase...</div>
        )}
        {purchaseSaveError && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#f87171', whiteSpace: 'pre-wrap' }}>
            Lưu purchase thất bại: {purchaseSaveError}
          </div>
        )}
        {error && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#f87171', whiteSpace: 'pre-wrap' }}>
            "Người Mua Đã Hủy Giao Dịch"
          </div>
        )}
      </div>

      {flowOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tiến trình mua vé"
          onClick={() => {
            if (!busy) setFlowOpen(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              borderRadius: '16px',
              border: '1px solid rgba(212,175,55,0.25)',
              background: 'rgba(42,26,17,0.98)',
              padding: '16px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 900, color: '#f5f1e8', fontSize: '16px' }}>Tiến trình mua vé</div>
                <div style={{ marginTop: '6px', color: 'rgba(232,224,208,0.85)', fontSize: '13px' }}>
                  {flowMessage || 'Đang xử lý...'}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFlowOpen(false)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(92,64,51,0.8)',
                  background: 'rgba(61,40,23,0.45)',
                  color: '#e8e0d0',
                  opacity: busy ? 0.6 : 1,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                }}
              >
                Đóng
              </button>
            </div>

            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
              {[
                { key: 'signing', label: 'Xác nhận giao dịch (MetaMask)' },
                { key: 'confirming', label: 'Chờ blockchain xác nhận' },
                {
                  key: 'saving',
                  label: flowStage === 'success' ? 'Mua hoàn tất' : 'Xử lý giao dịch',
                },
              ].map((s) => {
                const done =
                  flowStage === 'success' ||
                  (flowStage === 'confirming' && s.key === 'signing') ||
                  (flowStage === 'saving' && (s.key === 'signing' || s.key === 'confirming')) ||
                  (flowStage === 'failed' && (s.key === 'signing' || s.key === 'confirming' || s.key === 'saving'))
                const active = flowStage === (s.key as any)
                const showLoading = active && !done && flowStage !== 'failed'
                return (
                  <div
                    key={s.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1px solid rgba(92,64,51,0.7)',
                      background: active ? 'rgba(212,175,55,0.12)' : 'rgba(61,40,23,0.25)',
                      transition: 'background 200ms ease, transform 200ms ease',
                      transform: active ? 'translateY(-1px)' : 'translateY(0)',
                    }}
                    className={showLoading ? 'animate-pulse' : ''}
                  >
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '999px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        color: done ? '#0f172a' : '#f5f1e8',
                        background: done
                          ? 'linear-gradient(135deg,#22c55e,#4ade80)'
                          : active
                            ? 'linear-gradient(135deg,#d4af37,#f4d03f)'
                            : 'rgba(92,64,51,0.55)',
                        transition: 'background 200ms ease, color 200ms ease',
                      }}
                    >
                      {done ? '✓' : showLoading ? '⏳' : '•'}
                    </div>
                    <div style={{ color: '#f5f1e8', fontWeight: 800, fontSize: '13px' }}>{s.label}</div>
                  </div>
                )
              })}
            </div>

            {txHash && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(232,224,208,0.8)', wordBreak: 'break-all' }}>
                Tx: {txHash}
              </div>
            )}

            {flowStage === 'success' && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#86efac', fontWeight: 800 }}>Hoàn tất.</div>
            )}
            {flowStage === 'failed' && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#fca5a5', fontWeight: 800 }}>Thất bại.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
