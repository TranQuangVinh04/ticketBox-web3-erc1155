import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import Header from '../components/Header'
import { checkin } from '../api/tickets'

type ScanResult =
  | {
      ok: true
      eventName?: string
      ticketType?: 'Thường' | 'VIP' | 'VVIP'
      welcomeMessage?: string
      seatingHint?: string
      burnedAmount?: number
      remainingBalance?: string
      burnTxHash?: string
    }
  | { ok: false; error: string }

function CheckinScannerContent({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>('')
  const [manualInput, setManualInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const processQr = useCallback(async (qrText: string): Promise<ScanResult> => {
    const trimmed = qrText.trim()
    if (!trimmed) return { ok: false, error: 'QR trống' }

    try {
      const res = await checkin(trimmed)
      if (res.ok && res.ticket) {
        return {
          ok: true,
          eventName: res.welcome?.eventName ?? res.ticket.event?.name ?? undefined,
          ticketType: res.welcome?.ticketType,
          welcomeMessage: res.welcome?.message,
          seatingHint: res.welcome?.seatingHint,
          burnedAmount: res.onchain?.burnedAmount,
          remainingBalance: res.onchain?.balanceAfter,
          burnTxHash: res.onchain?.burnTxHash,
        }
      }
      return { ok: false, error: (res as any)?.error ?? 'Lỗi không xác định' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối'
      return { ok: false, error: msg }
    }
  }, [])

  const handleScan = useCallback(
    async (decodedText: string) => {
      if (status === 'success' || status === 'error' || isSubmitting) return

      setStatus('scanning')
      setIsSubmitting(true)

      const result = await processQr(decodedText)

      if (result.ok) {
        setStatus('success')
        const eventLabel = result.eventName ? ` sự kiện ${result.eventName}` : ' sự kiện này'
        const ticketType = result.ticketType ? ` Vé của bạn là loại ${result.ticketType}.` : ''
        const welcome = result.welcomeMessage ?? `Chào mừng bạn đến với${eventLabel}.`
        const seatHint = result.seatingHint ?? ''
        setMessage(`✓ Vé verify thành công. ${welcome}${ticketType} ${seatHint}`)
      } else {
        setStatus('error')
        setMessage(mapErrorToMessage(result.error))
      }

      setIsSubmitting(false)
    },
    [processQr, status, isSubmitting],
  )

  const handleManualSubmit = async () => {
    if (!manualInput.trim() || isSubmitting) return

    setIsSubmitting(true)
    setStatus('scanning')

    const result = await processQr(manualInput)

    if (result.ok) {
      setStatus('success')
      const eventLabel = result.eventName ? ` sự kiện ${result.eventName}` : ' sự kiện này'
      const ticketType = result.ticketType ? ` Vé của bạn là loại ${result.ticketType}.` : ''
      const welcome = result.welcomeMessage ?? `Chào mừng bạn đến với${eventLabel}.`
      const seatHint = result.seatingHint ?? ''
      setMessage(`✓ Vé verify thành công. ${welcome}${ticketType} ${seatHint}`)
    } else {
      setStatus('error')
      setMessage(mapErrorToMessage(result.error))
    }

    setIsSubmitting(false)
  }

  const startCamera = useCallback(async () => {
    if (!containerRef.current) return

    try {
      const html5Qr = new Html5Qrcode('checkin-qr-reader')
      scannerRef.current = html5Qr

      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 5, qrbox: { width: 250, height: 250 } },
        (text) => void handleScan(text),
        () => {},
      )
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setMessage('Không thể bật camera. Vui lòng cấp quyền hoặc dùng nhập thủ công.')
    }
  }, [handleScan])

  const stopCamera = useCallback(() => {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const resetAndScan = () => {
    setStatus('idle')
    setMessage('')
    setManualInput('')
    void startCamera()
  }

  return (
    <div
      className={
        embedded ? '' : 'min-h-screen bg-gradient-to-b from-[#1e3a5f]/60 via-[#3d2817]/60 to-[#1e3a5f]/60'
      }
      style={embedded ? undefined : { fontFamily: "'Lora', serif" }}
    >
      {!embedded && <Header />}

      <main className={embedded ? 'max-w-2xl mx-auto px-0 py-4' : 'max-w-2xl mx-auto px-4 py-8'}>
        {!embedded && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h1
                className="text-2xl sm:text-3xl font-bold text-[#f4d03f] drop-shadow-lg"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Check-in Scanner
              </h1>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="px-3 py-2 rounded-lg bg-[#5c4033]/60 hover:bg-[#5c4033]/80 border border-[#5c4033]/50 text-[#e8e0d0] hover:text-[#f4d03f] text-sm font-semibold transition-colors"
              >
                Về Admin
              </button>
            </div>

            <p className="text-sm text-[#e8e0d0]/90 mb-6">
              Quét QR vé từ người tham dự để xác thực và đánh dấu check-in. QR có chữ ký, verify on-chain.
            </p>
          </>
        )}

        {/* Camera area */}
        <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-2xl border border-[#5c4033]/50 p-4 mb-6">
          <div
            ref={containerRef}
            id="checkin-qr-reader"
            className="rounded-xl overflow-hidden bg-black/40 min-h-[280px]"
          />

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Bật camera
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="px-4 py-3 bg-[#5c4033]/60 border border-[#5c4033]/50 text-[#e8e0d0] font-semibold rounded-xl hover:bg-[#5c4033]/80 transition-colors"
            >
              Tắt camera
            </button>
          </div>
        </div>

        {/* Manual input */}
        <div className="bg-[#3d2817]/60 backdrop-blur-md rounded-2xl border border-[#5c4033]/50 p-4 mb-6">
          <h2 className="text-lg font-bold text-[#f4d03f] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            Nhập thủ công (dán payload QR)
          </h2>
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder='Dán nội dung QR (JSON {"data":"...","sig":"..."})'
            className="w-full h-24 px-4 py-3 rounded-xl bg-black/20 border border-[#5c4033]/50 text-[#e8e0d0] placeholder-[#e8e0d0]/50 text-sm font-mono resize-none"
          />
          <button
            type="button"
            onClick={() => void handleManualSubmit()}
            disabled={!manualInput.trim() || isSubmitting}
            className="mt-3 w-full px-4 py-3 bg-gradient-to-r from-[#d4af37] to-[#f4d03f] text-[#3d2817] font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Check-in'}
          </button>
        </div>

        {/* Result */}
        {(status === 'success' || status === 'error') && (
          <div
            className={`rounded-2xl p-4 border ${
              status === 'success'
                ? 'bg-[#064e3b]/45 border-[#34d399]/50 text-[#d1fae5]'
                : 'bg-[#7c2d12]/35 border-[#f59e0b]/50 text-[#fde68a]'
            }`}
          >
            <div className="flex items-start gap-2 mb-3">
              <span className="text-lg leading-none" aria-hidden="true">
                {status === 'success' ? '✅' : '⚠️'}
              </span>
              <p className="font-semibold leading-relaxed">{message}</p>
            </div>
            {status === 'success' && (
              <p className="text-xs mb-3 text-[#a7f3d0]">
                Check-in đã ghi nhận on-chain{message.includes('còn lại') ? '' : ' và cập nhật số dư vé'}.
              </p>
            )}
            <button
              type="button"
              onClick={resetAndScan}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                status === 'success'
                  ? 'bg-[#10b981]/20 hover:bg-[#10b981]/30 border-[#34d399]/50 text-[#ecfdf5]'
                  : 'bg-[#f59e0b]/20 hover:bg-[#f59e0b]/30 border-[#f59e0b]/50 text-[#fffbeb]'
              }`}
            >
              Quét tiếp
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function mapErrorToMessage(error: string): string {
  const map: Record<string, string> = {
    QR_INVALID_JSON: 'QR không hợp lệ (không phải JSON)',
    QR_INVALID_FORMAT: 'QR thiếu data/sig',
    QR_BAD_SIGNATURE: 'Chữ ký không hợp lệ – QR có thể bị giả mạo',
    QR_BAD_PAYLOAD: 'Payload QR không đúng định dạng',
    QR_EXPIRED: 'QR đã hết hạn (TTL 24h)',
    TICKET_NOT_FOUND: 'Không tìm thấy vé trong hệ thống',
    EVENT_MISMATCH: 'Sự kiện không khớp',
    CONTRACT_MISMATCH: 'Contract trong QR không khớp với vé trong hệ thống',
    CHAIN_MISMATCH: 'Chain trong QR không khớp với dữ liệu vé',
    TOKEN_MISMATCH: 'Loại vé (tokenId) trong QR không khớp',
    AMOUNT_MISMATCH: 'Số lượng vé trong QR không khớp',
    NONCE_MISMATCH: 'Nonce không khớp',
    ALREADY_CHECKED_IN: 'Vé đã được check-in trước đó',
    TICKET_REVOKED: 'Vé đã bị thu hồi',
    ONCHAIN_NOT_OWNED: 'Ví không còn sở hữu vé trên blockchain',
    ONCHAIN_CONTRACT_NOT_FOUND: 'Contract không tồn tại trên RPC hiện tại (kiểm tra chainId / RPC)',
    CHAIN_RPC_URL_MISSING_FOR_CHAIN: 'Thiếu RPC URL cho chain này trên backend',
    BURNER_NOT_CONFIGURED: 'Backend chưa cấu hình ví burner để đốt vé',
    BURN_NOT_AUTHORIZED: 'Ví burner không có quyền burnTicket trên contract',
    BURN_AMOUNT_RULE: 'Contract hiện không cho burn amount=1 (đang require amount > 1)',
    BURN_NOT_EFFECTIVE: 'Giao dịch burn không làm giảm số vé như kỳ vọng',
    ONCHAIN_VERIFY_FAILED: 'Không thể xác minh on-chain (kiểm tra CHAIN_RPC_URL)',
    QR_VERIFY_NOT_CONFIGURED: 'Backend chưa cấu hình QR_SIGNING_SECRET',
  }
  return map[error] || error
}

export default function CheckinScanner() {
  return <CheckinScannerContent />
}

export function CheckinScannerEmbedded() {
  return <CheckinScannerContent embedded />
}
