import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { formatEther } from 'viem'
import { useMemo, useState } from 'react'
import { ticket1155Abi } from '../abi/ticket1155Abi'

/**
 * Validate địa chỉ EVM dạng 0x + 40 ký tự hex.
 * Lưu ý: đây là validate "định dạng", không kiểm tra checksum EIP-55.
 */
function isHexAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v)
}

/**
 * Component demo tương tác với contract vé sự kiện (Ticket1155 - ERC1155).
 *
 * Mục tiêu:
 * - Mỗi event có thể deploy 1 contract riêng → UI cho nhập `eventContract` (địa chỉ contract).
 * - Chọn `tokenId` (loại vé) để xem thông tin & mua/burn.
 *
 * Phụ thuộc:
 * - ABI nằm ở `src/abi/ticket1155Abi.ts` (bạn có thể paste ABI full của contract vào đó).
 */
function ContractExample() {
  const { address, isConnected } = useAccount()

  // ===== UI state (input từ người dùng) =====
  // Mỗi event có 1 contract khác nhau → nhập địa chỉ contract ở đây.
  const [eventContractInput, setEventContractInput] = useState('0x')
  // tokenId = loại vé (VIP/Regular...), dùng uint256 trên contract nên ta parse sang BigInt.
  const [tokenIdInput, setTokenIdInput] = useState('1')
  // burnAmount = số lượng vé muốn burn (uint256).
  const [burnAmountInput, setBurnAmountInput] = useState('1')

  // ===== Parse + validate input (string -> typed values) =====
  /**
   * eventContract:
   * - undefined nếu input sai định dạng (để tránh gọi contract với address rác)
   * - `0x${string}` nếu hợp lệ để wagmi/viem chấp nhận type.
   */
  const eventContract = useMemo(() => {
    const v = eventContractInput.trim()
    return isHexAddress(v) ? (v as `0x${string}`) : undefined
  }, [eventContractInput])

  /**
   * tokenId: parse string số nguyên không âm -> BigInt.
   * - undefined nếu input rỗng/sai format.
   */
  const tokenId = useMemo(() => {
    const v = tokenIdInput.trim()
    if (!v) return undefined
    if (!/^\d+$/.test(v)) return undefined
    try {
      return BigInt(v)
    } catch {
      return undefined
    }
  }, [tokenIdInput])

  /**
   * burnAmount: parse string số nguyên không âm -> BigInt.
   * - undefined nếu input rỗng/sai format.
   */
  const burnAmount = useMemo(() => {
    const v = burnAmountInput.trim()
    if (!v) return undefined
    if (!/^\d+$/.test(v)) return undefined
    try {
      return BigInt(v)
    } catch {
      return undefined
    }
  }, [burnAmountInput])

  // Chỉ query khi đã có đủ eventContract + tokenId hợp lệ.
  const canQuery = !!eventContract && tokenId !== undefined

  // ===== Read contract (view calls) =====
  const { data: ticketType } = useReadContract({
    address: eventContract,
    abi: ticket1155Abi,
    functionName: 'getTicketType',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: canQuery },
  })

  const { data: priceWei } = useReadContract({
    address: eventContract,
    abi: ticket1155Abi,
    functionName: 'ticketPrices',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: canQuery },
  })

  const { data: tokenUri } = useReadContract({
    address: eventContract,
    abi: ticket1155Abi,
    functionName: 'uri',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: canQuery },
  })

  const { data: myBalance } = useReadContract({
    address: eventContract,
    abi: ticket1155Abi,
    functionName: 'balanceOf',
    args: address && tokenId !== undefined ? [address, tokenId] : undefined,
    query: { enabled: canQuery && !!address && isConnected },
  })

  // ===== Write contract (transactions) =====
  // writeContract: gửi tx, trả về `hash` để theo dõi receipt.
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  // Đợi tx được confirm để cập nhật trạng thái UI.
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  /**
   * buyTicket(tokenId) là payable:
   * - Giá lấy từ `ticketPrices[tokenId]` (đơn vị wei).
   * - Nếu priceWei chưa load được thì value = 0n (có thể revert nếu contract yêu cầu msg.value == price).
   */
  const handleBuy = () => {
    if (!eventContract || tokenId === undefined) return
    const value = typeof priceWei === 'bigint' ? priceWei : 0n

    writeContract({
      address: eventContract,
      abi: ticket1155Abi,
      functionName: 'buyTicket',
      args: [tokenId],
      value,
    })
  }

  /**
   * burnTicket(account, tokenId, amount)
   * - Chỉ owner của vé / operator đã approve / staff mới burn được (theo contract của bạn).
   */
  const handleBurn = () => {
    if (!eventContract || tokenId === undefined || !address || burnAmount === undefined) return
    writeContract({
      address: eventContract,
      abi: ticket1155Abi,
      functionName: 'burnTicket',
      args: [address, tokenId, burnAmount],
    })
  }

  if (!isConnected) {
    return (
      <div className="card">
        <h2>📄 Ví dụ Tương tác Smart Contract (Ticket1155 - ERC1155)</h2>
        <p style={{ color: '#888', marginTop: '1rem' }}>
          Vui lòng kết nối ví để xem ví dụ
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>📄 Ví dụ Tương tác Smart Contract (Ticket1155 - ERC1155)</h2>
      
      <div style={{ marginTop: '1rem', textAlign: 'left' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Chọn contract sự kiện</h3>
        <div className="info-item">
          <div className="info-label">Địa chỉ contract</div>
          <div className="info-value" style={{ width: '100%' }}>
            <input
              type="text"
              placeholder="0x... (Ticket1155 contract address)"
              value={eventContractInput}
              onChange={(e) => setEventContractInput(e.target.value)}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                width: '100%',
              }}
            />
            {!eventContract && eventContractInput.trim() !== '' && eventContractInput.trim() !== '0x' && (
              <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: '#f87171' }}>
                Địa chỉ contract không hợp lệ
              </div>
            )}
          </div>
        </div>
        
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Token ID (loại vé)</div>
          <div className="info-value" style={{ width: '100%' }}>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Ví dụ: 1"
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
            {tokenId === undefined && tokenIdInput.trim() !== '' && (
              <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: '#f87171' }}>
                Token ID không hợp lệ (chỉ nhận số nguyên không âm)
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Thông tin vé</h3>
        <div className="info-item">
          <div className="info-label">Tên loại vé</div>
          <div className="info-value">{ticketType?.[0] || 'N/A'}</div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Giá (ETH)</div>
          <div className="info-value">
            {typeof priceWei === 'bigint' ? `${formatEther(priceWei)} ETH` : 'N/A'}
          </div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Max supply</div>
          <div className="info-value">{ticketType ? String(ticketType[1]) : 'N/A'}</div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Đã mint (currentSupply)</div>
          <div className="info-value">{ticketType ? String(ticketType[2]) : 'N/A'}</div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Trạng thái bán</div>
          <div className="info-value">{ticketType ? (ticketType[3] ? 'Active' : 'Inactive') : 'N/A'}</div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Đã burn (currentBurn)</div>
          <div className="info-value">{ticketType ? String(ticketType[4]) : 'N/A'}</div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Số vé của tôi</div>
          <div className="info-value">{typeof myBalance === 'bigint' ? String(myBalance) : 'N/A'}</div>
        </div>
        <div className="info-item" style={{ marginTop: '0.5rem' }}>
          <div className="info-label">Token URI</div>
          <div className="info-value" style={{ wordBreak: 'break-all' }}>{tokenUri || 'N/A'}</div>
        </div>

        <h3 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Mua vé</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={handleBuy}
            disabled={isPending || isConfirming || !eventContract || tokenId === undefined}
            style={{
              marginTop: '0.5rem',
              opacity: isPending || isConfirming || !eventContract || tokenId === undefined ? 0.5 : 1,
            }}
          >
            {isPending
              ? 'Đang xác nhận...'
              : isConfirming
              ? 'Đang chờ xác nhận...'
              : isConfirmed
              ? 'Thành công!'
              : 'Mua vé (buyTicket)'}
          </button>

          <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Burn vé</h3>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="Số lượng burn"
            value={burnAmountInput}
            onChange={(e) => setBurnAmountInput(e.target.value)}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              width: '100%',
            }}
          />
          <button
            onClick={handleBurn}
            disabled={isPending || isConfirming || !eventContract || tokenId === undefined || burnAmount === undefined}
            style={{
              marginTop: '0.25rem',
              opacity: isPending || isConfirming || !eventContract || tokenId === undefined || burnAmount === undefined ? 0.5 : 1,
              background: '#f87171',
            }}
          >
            Burn (burnTicket)
          </button>
          
          {hash && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
              Hash: {hash}
            </div>
          )}
          {error && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#f87171', whiteSpace: 'pre-wrap' }}>
              Lỗi: {error.message}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255, 193, 7, 0.1)', borderRadius: '8px', fontSize: '0.875rem', color: '#ffc107' }}>
        <strong>Lưu ý:</strong> Mỗi event bạn có thể deploy 1 contract Ticket1155 khác nhau, nên component này cho nhập địa chỉ contract trực tiếp.
        <br />
        <span>
          Ngoài ra, trong contract bạn gửi có <code>require(amount &gt; 1)</code> ở <code>_updateSupplyOnBurn</code> nên burn 1 vé sẽ revert.
        </span>
      </div>
    </div>
  )
}

export default ContractExample
