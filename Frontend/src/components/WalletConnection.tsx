import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useDisconnect } from 'wagmi'

function WalletConnection() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()


  return (
    <div className="card">
      <h2>Kết nối ví</h2>
      <div style={{ marginTop: '1rem' }}>
        <ConnectButton />
      </div>
      
      {isConnected && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(76, 222, 128, 0.1)', borderRadius: '8px' }}>
          <p style={{ color: '#4ade80', fontWeight: '600' }}>
            Đã kết nối: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
          <button 
            onClick={() => disconnect()}
            style={{ marginTop: '0.5rem', background: '#f87171' }}
          >
            Ngắt kết nối
          </button>
        </div>
      )}
    </div>
  )
}

export default WalletConnection
